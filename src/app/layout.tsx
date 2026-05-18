import type { Metadata } from 'next';
import './globals.css';
import '@/components/CapacitorBootstrap';
import { AuthProvider } from '@/components/AuthProvider';
import { ThemeBootstrap } from '@/components/ThemeBootstrap';
import { SmallScreenModal } from '@/components/SmallScreenModal';
import { CapacitorBootstrap } from '@/components/CapacitorBootstrap';
import { RequiresInternetDialogHost } from '@/components/RequiresInternetDialog';
import { OfflineNavigationGuard } from '@/components/OfflineNavigationGuard';
import { OfflineBootstrapGate } from '@/components/OfflineBootstrapGate';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'ISO Pro',
  description: 'Offline-capable compliance platform for ISO-led service brands and compliance workflows',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon-180.png', type: 'image/png' },
      { url: '/apple-touch-icon-152.png', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang='en'
      className='h-full antialiased'
      suppressHydrationWarning
    >
      <head>
        <meta name='mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-status-bar-style' content='default' />
        <meta name='theme-color' content='#0f172a' />
        <link rel='manifest' href='/manifest.webmanifest' />
        <link rel='apple-touch-icon' sizes='180x180' href='/apple-touch-icon-180.png' />
        <link rel='apple-touch-icon' sizes='152x152' href='/apple-touch-icon-152.png' />
        <link rel='icon' href='/icon.svg' />
      </head>
      <body className='min-h-full flex flex-col'>
        <ThemeBootstrap />
        <AuthProvider>
          <CapacitorBootstrap />
          <RequiresInternetDialogHost />
          <OfflineNavigationGuard />
          <Suspense fallback={null}>
            <OfflineBootstrapGate>{children}</OfflineBootstrapGate>
          </Suspense>
        </AuthProvider>
        <SmallScreenModal />
      </body>
    </html>
  );
}
