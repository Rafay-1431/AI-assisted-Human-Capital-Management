'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setMobileNavOpen } from '@/store/slices/uiSlice';

/**
 * Mobile navigation, split in TWO pieces that must live in DIFFERENT places:
 *
 *  - <MobileNavButton />   → inside the sticky header (just the hamburger).
 *  - <MobileDrawer />      → at the LAYOUT ROOT, NOT inside the header.
 *
 * Why the split matters: the header uses `backdrop-blur`, which creates a
 * CSS containing block for fixed-position descendants. A drawer rendered
 * inside the header would be trapped and squashed into the header's box
 * instead of covering the viewport. Rendering the drawer at the root keeps
 * `fixed inset-0 z-50` truly viewport-wide.
 */

export function MobileNavButton() {
  const dispatch = useAppDispatch();

  return (
    <button
      onClick={() => dispatch(setMobileNavOpen(true))}
      aria-label="Open menu"
      className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 md:hidden"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 6h18M3 12h18M3 18h18" />
      </svg>
    </button>
  );
}

export function MobileDrawer({ items, role }) {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.mobileNavOpen);
  const pathname = usePathname();

  // Close on navigation (backup — links also close explicitly on click)
  // and lock body scroll while open.
  useEffect(() => {
    dispatch(setMobileNavOpen(false));
  }, [pathname, dispatch]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const close = () => dispatch(setMobileNavOpen(false));

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        className="absolute inset-0 bg-gray-900/40"
        onClick={close}
      />
      <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Menu</p>
          <button
            onClick={close}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) =>
            item.children ? (
              <div key={item.label} className="pt-2">
                <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {item.label}
                </p>
                {item.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={close}
                    className={`block rounded-lg px-3 py-2 text-sm ${
                      pathname.startsWith(child.href)
                        ? 'bg-teal-50 font-medium text-teal-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className={`block rounded-lg px-3 py-2 text-sm ${
                  pathname.startsWith(item.href)
                    ? 'bg-teal-50 font-medium text-teal-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <p className="border-t border-gray-200 p-4 text-xs text-gray-400">Signed in as {role}</p>
      </aside>
    </div>
  );
}
