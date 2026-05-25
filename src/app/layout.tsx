import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { ThemeBootstrap } from '@/components/ThemeBootstrap';
import { SmallScreenModal } from '@/components/SmallScreenModal';
import { CapacitorBootstrap } from '@/components/CapacitorBootstrap';
import { CapacitorAppRecovery } from '@/components/CapacitorAppRecovery';
import { CapacitorEntryRedirect } from '@/components/CapacitorEntryRedirect';
import { CapacitorBackButtonHandler } from '@/components/CapacitorBackButtonHandler';
import { PushNotificationsBootstrap } from '@/components/PushNotificationsBootstrap';
import { RequiresInternetDialogHost } from '@/components/RequiresInternetDialog';
import { OfflineNavigationGuard } from '@/components/OfflineNavigationGuard';
import { OfflineBootstrapGate } from '@/components/OfflineBootstrapGate';
import { InternetStatusBar } from '@/components/InternetStatusBar';
import { SearchParamsBoundary } from '@/components/SearchParamsBoundary';
import { NativeUpdateGate } from '@/components/NativeUpdateGate';
import { LiveUpdateBootstrap } from '@/components/LiveUpdateBootstrap';
import { NativeOtaStatusBar } from '@/components/NativeOtaStatusBar';
import { OtaBundleRecovery } from '@/components/OtaBundleRecovery';
import { TenantMessageProvider } from '@/components/messages/TenantMessageCenter';
import { CapacitorStylesGuard } from '@/components/CapacitorStylesGuard';
import { WebShellCleanup } from '@/components/WebShellCleanup';
import { CAPACITOR_CRITICAL_CSS } from '@/lib/capacitor/criticalStyles';

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
      style={{ colorScheme: 'light' }}
      suppressHydrationWarning
    >
      <head>
        <meta name='mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-status-bar-style' content='default' />
        <meta name='color-scheme' content='light' />
        <meta name='theme-color' content='#f5efe6' />
        <link rel='manifest' href='/manifest.webmanifest' />
        <link rel='apple-touch-icon' sizes='180x180' href='/apple-touch-icon-180.png' />
        <link rel='apple-touch-icon' sizes='152x152' href='/apple-touch-icon-152.png' />
        <link rel='icon' href='/icon.svg' />
        {process.env.NEXT_PUBLIC_CAPACITOR_APP === '1' ? (
          <>
            <style id="iso-capacitor-critical-css">{CAPACITOR_CRITICAL_CSS}</style>
            {/* eslint-disable-next-line @next/next/no-sync-scripts */}
            <script src='/capacitor-entry-redirect.js' />
            {/* eslint-disable-next-line @next/next/no-sync-scripts */}
            <script src='/capacitor-hardware-back.js' />
          </>
        ) : null}
      </head>
      <body className='min-h-full flex flex-col'>
        <ThemeBootstrap />
        <WebShellCleanup />
        <InternetStatusBar />
        <NativeOtaStatusBar />
        <AuthProvider>
          <CapacitorBootstrap />
          <CapacitorStylesGuard />
          <NativeUpdateGate />
          <LiveUpdateBootstrap />
          <OtaBundleRecovery />
          <CapacitorEntryRedirect />
          <CapacitorAppRecovery />
          <CapacitorBackButtonHandler />
          <PushNotificationsBootstrap />
          <RequiresInternetDialogHost />
          <OfflineNavigationGuard />
          <SearchParamsBoundary fullScreen>
            <TenantMessageProvider>
              <OfflineBootstrapGate>{children}</OfflineBootstrapGate>
            </TenantMessageProvider>
          </SearchParamsBoundary>
        </AuthProvider>
        <SmallScreenModal />
      </body>
    </html>
  );
}
