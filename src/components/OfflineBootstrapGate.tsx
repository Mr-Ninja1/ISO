'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Database, LogOut, ShieldCheck, Sparkles, Wifi } from 'lucide-react';
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
  onSignOut,
  signingOut,
}: {
  progress: OfflineBootstrapProgress;
  error: string;
  offline: boolean;
  onRetry: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const isComplete = progress.percent >= 100;

  return (
    <div className='fixed inset-0 z-[9998] flex min-h-dvh items-center justify-center overflow-hidden bg-[#071b1a] px-4 py-8 text-white'>
      <div className='pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(108,255,214,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(108,255,214,0.07)_1px,transparent_1px)] [background-size:42px_42px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_78%)]' />
      <div className='pointer-events-none absolute -left-32 top-1/3 h-80 w-80 rounded-full bg-[#27e0b0]/15 blur-3xl' />
      <div className='pointer-events-none absolute -right-28 top-10 h-72 w-72 rounded-full bg-[#5e7cff]/15 blur-3xl' />

      <div className='relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/15 bg-[#0b2927]/90 shadow-[0_24px_100px_rgba(0,0,0,0.4)] backdrop-blur-xl'>
        <div className='flex items-center justify-between border-b border-white/10 px-6 py-4 sm:px-8'>
          <div className='flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9bf9dc]'>
            <span className='h-2 w-2 animate-pulse rounded-full bg-[#43edbd] shadow-[0_0_12px_#43edbd]' />
            ISO Grid / Secure setup
          </div>
          <span className='font-mono text-xs text-white/45'>{String(Math.round(progress.percent)).padStart(2, '0')}%</span>
        </div>

        <div className='p-6 sm:p-9'>
          <div className='flex items-start gap-4'>
            <div className='relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#5ff0c7]/30 bg-[#5ff0c7]/10 text-[#72f6ce]'>
              <span className='absolute inset-1 rounded-xl border border-[#5ff0c7]/20' />
              {isComplete ? <ShieldCheck className='relative h-6 w-6' /> : <Sparkles className='relative h-6 w-6 animate-pulse' />}
            </div>
            <div className='min-w-0'>
              <p className='mb-2 text-xs font-medium uppercase tracking-[0.18em] text-[#72f6ce]/70'>First connection</p>
              <h1 className='text-2xl font-semibold tracking-tight text-white sm:text-3xl'>Making your workspace yours</h1>
              <p className='mt-2 max-w-md text-sm leading-6 text-white/60'>A quick one-time sync keeps your workspace fast, even when the signal disappears.</p>
            </div>
          </div>

          <div className='mt-8'>
            <div className='h-2 overflow-hidden rounded-full bg-white/10'>
              <div
                className='relative h-full rounded-full bg-gradient-to-r from-[#36d9aa] via-[#8af5d1] to-[#88a4ff] transition-all duration-500 ease-out'
                style={{ width: `${Math.max(3, progress.percent)}%` }}
              >
                <span className='absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 translate-x-1/2 rounded-full bg-white shadow-[0_0_18px_#8af5d1]' />
              </div>
            </div>
            <div className='mt-3 flex items-center justify-between gap-3'>
              <p className='text-sm font-medium text-white'>{progress.label}</p>
              {offline ? <span className='rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] text-amber-100'>Waiting for signal</span> : null}
            </div>
            {progress.detail ? <p className='mt-1 text-xs text-white/45'>{progress.detail}</p> : null}
          </div>

          <div className='mt-7 grid gap-3 sm:grid-cols-2'>
            <div className='rounded-2xl border border-white/10 bg-white/[0.045] p-4'>
              <Database className='h-4 w-4 text-[#72f6ce]' />
              <p className='mt-3 text-sm font-medium text-white/90'>Ready offline</p>
              <p className='mt-1 text-xs leading-5 text-white/50'>Forms and categories stay on this device.</p>
            </div>
            <div className='rounded-2xl border border-white/10 bg-white/[0.045] p-4'>
              <Wifi className='h-4 w-4 text-[#9aaeff]' />
              <p className='mt-3 text-sm font-medium text-white/90'>Built for the field</p>
              <p className='mt-1 text-xs leading-5 text-white/50'>Work keeps moving when coverage does not.</p>
            </div>
          </div>

          {error ? (
            <div className='mt-6 space-y-3 rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-4'>
              <p className='text-sm text-rose-100'>{error}</p>
              {offline ? <p className='text-xs text-white/50'>Reconnect to finish setup, then try again.</p> : null}
              <button type='button' className='inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0b2927] transition hover:bg-[#dffcf2]' onClick={onRetry}>
                Try again <ArrowRight className='h-4 w-4' />
              </button>
            </div>
          ) : (
            <p className='mt-6 text-xs text-white/40'>{offline ? 'Connect to the internet to begin your first sync.' : 'This only happens once on each device.'}</p>
          )}

          <div className='mt-7 flex items-center justify-between gap-4 border-t border-white/10 pt-5'>
            <p className='text-xs text-white/35'>Need to step away? You can sign out safely.</p>
            <button type='button' className='inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-50' onClick={onSignOut} disabled={signingOut}>
              <LogOut className='h-3.5 w-3.5' />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
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
  const { user, session, loading: authLoading, signOut } = useAuth();
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
  const [signingOut, setSigningOut] = useState(false);
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
    // Already bootstrapped on this device — never block home/form returns behind a gate shell.
    if (offlineCacheLooksReady(userId, tenantSlug)) {
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
        signingOut={signingOut}
        onSignOut={() => {
          if (signingOut) return;
          setSigningOut(true);
          void signOut()
            .catch(() => undefined)
            .finally(() => router.replace('/login'));
        }}
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
