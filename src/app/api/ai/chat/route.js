import { NextResponse } from 'next/server';
import { getSession } from '@/services/guard';
import { runAssistantChat } from '@/lib/ai/ai-service';

/**
 * POST /api/ai/chat — the ONLY AI endpoint. Server-side only:
 * the AI_API_KEY never reaches the browser, and the chat runs with the
 * caller's session so every tool executes inside their permission scope.
 */

const MAX_HISTORY = 20;

export async function POST(request) {
  const session = await getSession();
  if (!session?.profile?.is_active) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Accept only user/assistant text messages from the client — never tool
  // results or system messages (those are constructed server-side).
  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.length <= 4000,
    )
    .slice(-MAX_HISTORY);

  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }

  // Resolve the caller's employee row (RLS: own row) so self-data tools
  // (get_my_summary) can scope to it.
  const { data: empRow } = await session.supabase
    .from('employees')
    .select('id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const result = await runAssistantChat({
    profile: { ...session.profile, employeeId: empRow?.id ?? null },
    history,
    companyName: body.companyName ?? null,
  });

  return NextResponse.json(result);
}
