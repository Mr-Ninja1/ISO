'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { WorkspaceLoadingShell } from '@/components/WorkspaceLoadingShell';
import { useAuth } from '@/components/AuthProvider';
import { getWorkspaceAccessToken } from '@/lib/client/sessionAccessToken';
import { isAppOffline } from '@/lib/client/appOffline';
import {
  isOfflineBootstrapComplete,
  runOfflineBootstrap,
  type OfflineBootstrapProgress,
} from '@/lib/client/offlineBootstrap';
import { isCapacitorNativeApp } from '@/lib/capacitor/runtime';
import { isTenantTemplateBulkCached } from '@/lib/client/offlineTemplateWarmup';
import { readWorkspaceCacheResolved } from '@/lib/client/workspaceCache';
import { isTenantDeactivatedBlocked } from '@/lib/client/brandAccess';

const SKIP_PREFIXES = ['/login', '/signup', '/developer-login', '/onboarding', '/admin', '/offline'];

function normalizeTenantSlug(value: string | null | undefined) {
  const slug = (value || '').trim();
  if (!slug || slug === '_' || slug === 'workspace') return null;
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return null;
  return slug;
}

function shouldSkipBootstrap(pathname: string | null) {
  if (!pathname) return true;
  if (SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  // Skip audit routes (cached forms should open without the first-time gate)
  if (/^\/[^/]+\/audits(\/|$)/.test(pathname)) return true;
  return false;
}

function tenantSlugFromRoute(pathname: string | null, querySlug: string | null) {
  const normalizedQuerySlug = normalizeTenantSlug(querySlug);
  if (normalizedQuerySlug) return normalizedQuerySlug;
  if (typeof window !== 'undefined') {
    const last = normalizeTenantSlug(localStorage.getItem('lastTenantSlug'));
    if (last) return last;
  }
  if (!pathname) return null;
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0];
  const reserved = new Set(['workspace', 'dashboard', 'login', 'signup', 'onboarding', 'offline', 'admin', '_']);
  if (reserved.has(first)) return null;
  return normalizeTenantSlug(first);
}

function FirstTimeDownloadScreen({
  progress,
  error,
  offline,
  onRetry,
}: {
  progress: OfflineBootstrapProgress;
  error: string;
  offline: boolean;
  onRetry: () => void;
}) {
  return (
    <div className='fixed inset-0 z-[9998] flex min-h-dvh items-center justify-center bg-background px-4 py-8'>
      <div className='w-full max-w-lg overflow-hidden rounded-2xl border border-foreground/20 bg-background p-6 shadow-sm sm:p-8'>
        <div className='flex items-start gap-3'>
          <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-foreground/15 bg-foreground/[0.03]'>
            <Loader2 className='h-5 w-5 animate-spin text-foreground/70' />
          </div>
          <div className='min-w-0'>
            <h1 className='text-lg font-semibold sm:text-xl'>Preparing your brand for offline use</h1>
            <p className='mt-1 text-sm text-foreground/70'>
              First-time setup downloads your workspace, categories, and every form schema so you can start audits
              offline. Full saved-form history loads when you open Saved forms while online.
            </p>
          </div>
        </div>

        <div className='mt-6 overflow-hidden rounded-full bg-foreground/10'>
          <div
            className='h-2 rounded-full bg-foreground transition-all duration-300 ease-out'
            style={{ width: progress.percent + '%' }}
          />
        </div>
        <p className='mt-2 text-sm font-medium text-foreground'>{progress.label}</p>
        {progress.detail ? <p className='text-xs text-foreground/60'>{progress.detail}</p> : null}

        <div className='mt-5 grid gap-2 text-sm text-foreground/75 sm:grid-cols-2'>
          <div className='rounded-lg border border-foreground/15 bg-foreground/[0.03] p-3'>
            Categories, form cards, and checklists are saved on this device.
          </div>
          <div className='rounded-lg border border-foreground/15 bg-foreground/[0.03] p-3'>
            After this you can open forms and submit offline. Drafts stay on this device only.
          </div>
        </div>

        {error ? (
          <div className='mt-4 space-y-3'>
            <p className='rounded-md border border-foreground/20 bg-foreground/5 p-3 text-sm text-foreground'>{error}</p>
            {offline ? (
              <p className='text-xs text-foreground/60'>
                Connect to the internet to complete first-time download. Offline use is available after this step.
              </p>
            ) : null}
            <button
              type='button'
              className='h-10 w-full rounded-md bg-foreground px-4 text-sm font-medium text-background sm:w-auto'
              onClick={onRetry}
            >
              Try again
            </button>
          </div>
        ) : (
          <p className='mt-4 text-xs text-foreground/55'>
            {offline
              ? 'Waiting for internet to start download...'
              : 'Do not close the app - large brands may take several minutes.'}
          </p>
        )}
      </div>
    </div>
  );
}

function offlineCacheLooksReady(userId: string | null, tenantSlug: string) {
  if (!isOfflineBootstrapComplete(userId, tenantSlug)) return false;
  if (!isCapacitorNativeApp()) return true;
  return (
    isTenantTemplateBulkCached(tenantSlug) &&
    Boolean(readWorkspaceCacheResolved(userId, tenantSlug, null))
  );
}

/**
 * Blocks the UI until the active brand has been fully cached for offline (first login / new device).
 */
export function OfflineBootstrapGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, session, loading: authLoading } = useAuth();
  const accessToken = getWorkspaceAccessToken(session);
  const userId = user?.id || session?.user?.id || null;

  const tenantSlug = useMemo(
    () => tenantSlugFromRoute(pathname, searchParams.get('tenantSlug')),
    [pathname, searchParams]
  );

  const forceBootstrap = searchParams.get('forceBootstrap') === '1';
  const skip = shouldSkipBootstrap(pathname);
  const needsBootstrap =
    !skip &&
    Boolean(user) &&
    Boolean(tenantSlug) &&
    (forceBootstrap || !offlineCacheLooksReady(userId, tenantSlug!));

  const [ready, setReady] = useState(!needsBootstrap);
  const [progress, setProgress] = useState<OfflineBootstrapProgress>({
    stage: 'workspace',
    label: 'Starting download...',
    percent: 0,
  });
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const runIdRef = useRef(0);
  const bootstrapInFlightRef = useRef(false);
  const autoStartKeyRef = useRef<string | null>(null);

  const startBootstrap = useCallback(async () => {
    if (!tenantSlug || !accessToken) return;
    if (bootstrapInFlightRef.current) return;

    bootstrapInFlightRef.current = true;
    const runId = ++runIdRef.current;
    setError('');
    setReady(false);
    setProgress({ stage: 'workspace', label: 'Starting download...', percent: 0 });

    try {
      await runOfflineBootstrap({
        accessToken,
        tenantSlug,
        userId,
        onProgress: (p) => {
          if (runId !== runIdRef.current) return;
          setProgress(p);
        },
      });
      if (runId !== runIdRef.current) return;
      setReady(true);
    } catch (err: unknown) {
      if (runId !== runIdRef.current) return;
      const message = err instanceof Error ? err.message : 'Download failed';
      if (/tenant not found/i.test(message)) {
        try {
          localStorage.removeItem('lastTenantSlug');
        } catch {
          // ignore localStorage errors
        }
        if (pathname?.startsWith('/workspace')) {
          setReady(true);
          setError('');
          router.replace('/workspace');
          return;
        }
      }
      setError(message);
      setReady(false);
    } finally {
      bootstrapInFlightRef.current = false;
    }
  }, [accessToken, pathname, router, tenantSlug, userId]);

  const startBootstrapRef = useRef(startBootstrap);
  startBootstrapRef.current = startBootstrap;

  useEffect(() => {
    const update = () => setOffline(isAppOffline());
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setReady(true);
      return;
    }
    if (skip || !tenantSlug) {
      setReady(true);
      return;
    }
    if (isTenantDeactivatedBlocked(tenantSlug)) {
      setReady(true);
      return;
    }
    if (!needsBootstrap) {
      setReady(true);
      return;
    }
    if (!accessToken) {
      setReady(false);
      setError('Sign in is required before downloading offline data.');
      return;
    }
    if (offline) {
      if (!bootstrapInFlightRef.current) {
        setReady(false);
        setError('Internet is required for first-time setup. Connect and tap Try again.');
      }
      return;
    }

    const autoKey = `${userId || 'anon'}:${tenantSlug}`;
    if (autoStartKeyRef.current === autoKey) return;
    autoStartKeyRef.current = autoKey;

    void startBootstrapRef.current();
  }, [authLoading, user, skip, tenantSlug, needsBootstrap, accessToken, offline, userId]);

  if (authLoading) {
    return (
      <WorkspaceLoadingShell
        title="Signing in"
        subtitle="Restoring your session before opening the workspace…"
      />
    );
  }

  if (!ready && needsBootstrap) {
    return (
      <FirstTimeDownloadScreen
        progress={progress}
        error={error}
        offline={offline}
        onRetry={() => {
          if (!accessToken) {
            router.push('/login');
            return;
          }
          if (offline) return;
          autoStartKeyRef.current = null;
          void startBootstrap();
        }}
      />
    );
  }

  return <>{children}</>;
}
