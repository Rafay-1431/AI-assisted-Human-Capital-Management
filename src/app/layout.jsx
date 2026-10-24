import './globals.css';
import StoreProvider from '@/store/StoreProvider';

export const metadata = {
  applicationName: 'HCM Lite',
  title: { default: 'HCM Lite', template: '%s · HCM Lite' },
  description: 'AI-assisted Human Capital Management for Admin, HR and Employees',
  icons: { icon: '/favicon.ico' },
};

export const viewport = {
  themeColor: '#0d9488',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
