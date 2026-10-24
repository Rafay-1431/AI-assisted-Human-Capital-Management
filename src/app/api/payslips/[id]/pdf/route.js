import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getSession } from '@/services/guard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * GET /api/payslips/:id/pdf — checklist 17.
 * Access: RLS decides (employees only fetch their own payslip; staff fetch any).
 * The company name is read with the admin client server-side because employees
 * cannot select company_settings — read-only infrastructure use.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.profile?.is_active) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: payslip } = await session.supabase
    .from('payslips')
    .select(
      '*, run:payroll_runs(period_year, period_month, status, working_days), ' +
        'employee:employees(employee_code, user:profiles(full_name))',
    )
    .eq('id', id)
    .maybeSingle();
  if (!payslip) return new Response('Not found', { status: 404 });

  const admin = getSupabaseAdminClient();
  const { data: settings } = await admin
    .from('company_settings')
    .select('company_name')
    .eq('id', 1)
    .single();

  const money = (n) =>
    Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const teal = rgb(0.05, 0.45, 0.42);
  const gray = rgb(0.35, 0.35, 0.35);
  const light = rgb(0.8, 0.8, 0.8);

  let y = 790;
  const row = (label, value = null, { size = 11, strong = false, color = gray } = {}) => {
    const f = strong ? bold : font;
    const c = strong ? teal : color;
    page.drawText(label, { x: 56, y, size, font: f, color: c });
    if (value !== null) {
      const w = f.widthOfTextAtSize(value, size);
      page.drawText(value, { x: 539 - w, y, size, font: f, color: c });
    }
    y -= size + 7;
  };
  const rule = () => {
    page.drawLine({ start: { x: 56, y: y + 5 }, end: { x: 539, y: y + 5 }, thickness: 0.75, color: light });
    y -= 14;
  };

  row(settings?.company_name ?? 'HCM Lite', null, { size: 18, strong: true });
  row('Salary slip', null, { size: 11, color: gray });
  rule();
  row(`Employee:  ${payslip.employee?.user?.full_name ?? '—'}`);
  row(`Code:      ${payslip.employee?.employee_code ?? '—'}`);
  row(`Period:    ${payslip.run?.period_month}/${payslip.run?.period_year}   (${payslip.run?.status ?? ''})`);
  row(`Working days: ${payslip.working_days}`);
  y -= 6;

  row('Earnings', null, { size: 12, strong: true });
  row('Basic salary', money(payslip.basic_salary));
  row('House allowance (40%)', money(payslip.hra));
  row('Medical allowance (10%)', money(payslip.medical));
  row('Gross salary', money(payslip.gross_salary), { strong: true });
  y -= 4;

  row('Deductions', null, { size: 12, strong: true });
  row(`Absent days (${payslip.absent_days})`, money(payslip.absent_deduction));
  row(`Half days (${payslip.half_day_count} × 0.5)`, money(payslip.half_day_deduction));
  row('Income tax (annual slab ÷ 12)', money(payslip.tax_amount));
  y -= 4;

  rule();
  row('NET PAY', money(payslip.net_pay), { size: 13, strong: true });
  rule();

  y -= 4;
  page.drawText(
    'System-generated payslip from HCM Lite. Deductions derive from server-stamped attendance records.',
    { x: 56, y, size: 8, font, color: gray },
  );
  y -= 12;
  page.drawText(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, {
    x: 56, y, size: 8, font, color: gray,
  });

  const bytes = await pdf.save();

  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${payslip.employee?.employee_code ?? 'employee'}-${payslip.run?.period_month}-${payslip.run?.period_year}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
