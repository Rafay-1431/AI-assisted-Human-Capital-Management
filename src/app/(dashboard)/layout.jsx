import Link from 'next/link';
import { requireUser } from '@/services/guard';
import { NAV_ITEMS } from '@/lib/constants/permissions';
import SessionSync from '@/components/providers/SessionSync';
import LogoutButton from './logout-button';
import ChatDrawer from '@/components/ai/chat-drawer';

/**
 * Authed shell: role-aware sidebar (BambooHR-style grouped nav) + topbar.
 * The profile is fetched SERVER-side and handed to SessionSync, which mirrors
 * it into Redux after mount — no hydration mismatch, Redux never used for authz.
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

  return (
    <div className="flex min-h-screen">
      <SessionSync profile={clientProfile} />

      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-gray-200 bg-white p-4 md:flex">
        <p className="mb-4 px-2 text-lg font-semibold text-teal-700">HCM Lite</p>
        {(NAV_ITEMS[profile.role] ?? []).map((item) =>
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <p className="text-sm font-medium text-gray-700">
            {clientProfile.fullName}{' '}
            <span className="ml-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold uppercase text-teal-700">
              {clientProfile.role}
            </span>
          </p>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs text-gray-400 sm:block">{clientProfile.email}</p>
            <ChatDrawer role={clientProfile.role} />
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
