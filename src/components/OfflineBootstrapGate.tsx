'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { isTenantTemplateBulkCached } from '@/lib/client/offlineTemplateWarmup';
import { readWorkspaceCache, readWorkspaceCacheResolved } from '@/lib/client/workspaceCache';
import { isTenantDeactivatedBlocked } from '@/lib/client/brandAccess';
import { setOfflineBootstrapBlocking } from '@/lib/client/nativeStartupGate';

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
  // Template routes load their own workspace/template data and must not wait for
  // a full offline bootstrap before the user can open the builder.
  if (/^\/(?:[^/]+|_)\/templates(\/|$)/.test(pathname)) return true;
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
            <h1 className='text-lg font-semibold sm:text-xl'>Preparing your brand for fast offline use</h1>
            <p className='mt-1 text-sm text-foreground/70'>
              One-time setup downloads your workspace, every category, and every form schema to this device. After this,
              switching categories and opening forms stays local and sharp.
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
            Categories and form cards are saved locally so tab switches stay instant.
          </div>
          <div className='rounded-lg border border-foreground/15 bg-foreground/[0.03] p-3'>
            Form schemas are cached so audits open without waiting on the network.
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
              : 'Do not close this page — large brands may take a few minutes the first time only.'}
          </p>
        )}
      </div>
    </div>
  );
}

const readyCache = new Map<string, boolean>();

function readyCacheKey(userId: string | null, tenantSlug: string) {
  return `${userId || 'anon'}:${tenantSlug}`;
}

/** True when every category snapshot + every form schema is on-device. */
export function offlineCacheLooksReady(userId: string | null, tenantSlug: string) {
  const key = readyCacheKey(userId, tenantSlug);
  const cached = readyCache.get(key);
  if (cached === true) return true;

  if (!isOfflineBootstrapComplete(userId, tenantSlug)) {
    readyCache.set(key, false);
    return false;
  }
  const workspace = readWorkspaceCacheResolved(userId, tenantSlug, null);
  if (!workspace) {
    readyCache.set(key, false);
    return false;
  }
  if (workspace.categories.some((category) => !readWorkspaceCache(userId, tenantSlug, category.id))) {
    readyCache.set(key, false);
    return false;
  }
  // Presence of a successful bulk download is enough for "ready" — do not force a
  // blocking re-download every 24h just because the freshness marker aged out.
  const ready = isTenantTemplateBulkCached(tenantSlug, Number.POSITIVE_INFINITY);
  readyCache.set(key, ready);
  return ready;
}

/**
 * Blocks the UI until the active brand has been fully cached (first login / new device).
 * After a successful bootstrap (or a proven complete cache), later refreshes stay in the
 * background so navigations are never replaced by the full-screen gate again.
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

  // Start ready so SSR never flashes the download screen; client layout effect decides
  // before paint whether first-run download must hard-block.
  const [ready, setReady] = useState(true);
  const [progress, setProgress] = useState<OfflineBootstrapProgress>({
    stage: 'workspace',
    label: 'Starting download...',
    percent: 0,
  });
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [clientReady, setClientReady] = useState(false);
  const runIdRef = useRef(0);
  const bootstrapInFlightRef = useRef(false);
  const autoStartKeyRef = useRef<string | null>(null);
  /**
   * Set only after this brand has a complete on-device cache (or bootstrap succeeds).
   * Must NOT be set merely because `ready` defaults to true on mount — that used to
   * skip the blocking gate and leave category tabs fetching over the network.
   */
  const hasPaintedReadyCacheRef = useRef(false);

  const startBootstrap = useCallback(async () => {
    if (!tenantSlug || !accessToken) return;
    if (bootstrapInFlightRef.current) return;

    bootstrapInFlightRef.current = true;
    const runId = ++runIdRef.current;
    setError('');
    // Hard-block until first successful cache for this brand; later refreshes are background.
    if (!hasPaintedReadyCacheRef.current) {
      setReady(false);
    }
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
      if (tenantSlug) readyCache.set(readyCacheKey(userId, tenantSlug), true);
      hasPaintedReadyCacheRef.current = true;
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
          hasPaintedReadyCacheRef.current = true;
          setReady(true);
          setError('');
          router.replace('/workspace');
          return;
        }
      }
      setError(message);
      // Keep the shell usable after a ready cache has painted; only hard-block on first-run.
      if (hasPaintedReadyCacheRef.current) {
        setReady(true);
      } else {
        setReady(false);
      }
    } finally {
      bootstrapInFlightRef.current = false;
    }
  }, [accessToken, pathname, router, tenantSlug, userId]);

  const startBootstrapRef = useRef(startBootstrap);
  startBootstrapRef.current = startBootstrap;

  useEffect(() => {
    setClientReady(true);
  }, []);

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

  // Layout effect: decide block vs paint before the browser paints an uncached workspace.
  useLayoutEffect(() => {
    if (!clientReady) return;
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
      hasPaintedReadyCacheRef.current = true;
      setReady(true);
      return;
    }

    // Incomplete cache — block the shell until bootstrap finishes (unless we already
    // painted a ready cache earlier this session and are only refreshing).
    if (!hasPaintedReadyCacheRef.current) {
      setReady(false);
    }

    if (!accessToken) {
      if (hasPaintedReadyCacheRef.current) {
        setReady(true);
        return;
      }
      setReady(false);
      setError('Sign in is required before downloading offline data.');
      return;
    }
    if (offline) {
      if (!bootstrapInFlightRef.current) {
        if (hasPaintedReadyCacheRef.current) {
          setReady(true);
        } else {
          setReady(false);
          setError('Internet is required for first-time setup. Connect and tap Try again.');
        }
      }
      return;
    }

    const autoKey = `${userId || 'anon'}:${tenantSlug}`;
    if (autoStartKeyRef.current === autoKey) return;
    autoStartKeyRef.current = autoKey;

    void startBootstrapRef.current();
  }, [clientReady, authLoading, user, skip, tenantSlug, needsBootstrap, accessToken, offline, userId]);

  useEffect(() => {
    const blocking = Boolean(!ready && needsBootstrap && !hasPaintedReadyCacheRef.current);
    setOfflineBootstrapBlocking(blocking);
    return () => setOfflineBootstrapBlocking(false);
  }, [ready, needsBootstrap]);

  if (!clientReady) {
    // Avoid flashing the uncached workspace before we know whether first-run must block.
    if (skip || !tenantSlug) {
      return <>{children}</>;
    }
    return (
      <WorkspaceLoadingShell
        title="Loading"
        subtitle="Checking offline cache…"
      />
    );
  }

  if (authLoading && needsBootstrap && !hasPaintedReadyCacheRef.current) {
    return (
      <WorkspaceLoadingShell
        title="Signing in"
        subtitle="Restoring your session before preparing this brand…"
      />
    );
  }

  // Block until every category + form schema is on-device. After that, navigate freely
  // while any later refresh continues in the background.
  if (!ready && needsBootstrap && !hasPaintedReadyCacheRef.current) {
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
