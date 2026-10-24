import { redirect } from 'next/navigation';

/** Middleware handles the auth side; signed-in users land on their dashboard. */
export default function Home() {
  redirect('/dashboard');
}
