import Link from 'next/link';
import { requireUser } from '@/services/guard';
import { NAV_ITEMS } from '@/lib/constants/permissions';
import SessionSync from '@/components/providers/SessionSync';
import ToastHost from '@/components/providers/toast-host';
import { MobileNavButton, MobileDrawer } from '@/components/layout/mobile-nav';
import ChatDrawer from '@/components/ai/chat-drawer';
import LogoutButton from './logout-button';

/**
 * Authed shell (responsive) — three SEPARATE layers so nothing can overlap:
 *   1. Desktop sidebar (md+, sticky, scrolls independently).
 *   2. Content column: sticky topbar (hamburger + user + logout) → main.
 *   3. Root-level fixed overlays: MobileDrawer (z-50) and the floating AI
 *      widget (z-40) — rendered HERE, never inside the header, because the
 *      header's backdrop-blur would trap fixed-positioned children.
 * RBAC is untouched: menu items come from the server; proxy + guards enforce.
 */
export default async function DashboardLayout({ children }) {
  const session = await requireUser();
  const { profile } = session;

  const clientProfile = {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    isActive: profile.is_active,
    mustChangePassword: profile.must_change_password,
  };
  const navItems = NAV_ITEMS[profile.role] ?? [];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <SessionSync profile={clientProfile} />

      {/* Layer 1 — desktop sidebar only */}
      <aside className="hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-gray-200 bg-white p-4 md:sticky md:top-0 md:flex md:h-screen">
        <p className="mb-4 px-2 text-lg font-semibold text-teal-700">HCM Lite</p>
        {navItems.map((item) =>
          item.children ? (
            <div key={item.label} className="space-y-1">
              <p className="px-2 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {item.label}
              </p>
              {item.children.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  className="block rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  {child.label}
                </Link>
              ))}
            </div>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              {item.label}
            </Link>
          ),
        )}
      </aside>

      {/* Layer 2 — content column: topbar, then page */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <MobileNavButton />
            <p className="text-lg font-semibold text-teal-700 md:hidden">HCM Lite</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-gray-700">
                {clientProfile.fullName}{' '}
                <span className="ml-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold uppercase text-teal-700">
                  {clientProfile.role}
                </span>
              </p>
              <p className="text-xs text-gray-400">{clientProfile.email}</p>
            </div>
            <LogoutButton />
          </div>
        </header>

        <main className="page-enter flex-1 p-4 sm:p-6">{children}</main>
      </div>

      {/* Layer 3 — root-level overlays (kept OUT of the header on purpose) */}
      <MobileDrawer items={navItems} role={clientProfile.role} />
      <ChatDrawer role={clientProfile.role} userName={clientProfile.fullName} />
      <ToastHost />
    </div>
  );
}
