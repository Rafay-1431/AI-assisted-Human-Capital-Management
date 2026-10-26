'use client';

import { useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from './store';

/**
 * Client provider wrapper for the Next.js App Router.
 *
 * Mounted once in src/app/layout.jsx. The store lives in a ref so it is
 * created exactly once per browser session and never recreated on re-renders
 * or client-side navigations. Redux state is browser-only: server-rendered
 * HTML never reads from the store, so there are no hydration mismatches —
 * anything that must render on the server is passed down as props from
 * server components (see components/providers/SessionSync.jsx).
 */
export default function StoreProvider({ children }) {
  const storeRef = useRef(null);
  if (!storeRef.current) {
    storeRef.current = makeStore();
    // Dev debugging handle (never ships to production builds).
    if (process.env.NODE_ENV !== 'production') {
      if (typeof window !== 'undefined') window.__hcmStore = storeRef.current;
    }
  }
  return <Provider store={storeRef.current}>{children}</Provider>;
}
