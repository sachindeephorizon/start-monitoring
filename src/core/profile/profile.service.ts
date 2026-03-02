/**
 * Profile Service
 *
 * Fetches `mobile_users` profile data with production safety:
 * - AbortController-based timeouts (properly cancels zombie HTTP requests)
 * - ensureValidSession() pre-flight check
 * - bounded retries
 * - auth-refresh retry on 401/403-ish failures
 */

import { supabase, TABLES, ensureValidSession, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { AuthService } from '@/core/auth/auth.service';
import { apiBaseUrl } from '@/config/environment';
import type { MobileUserProfile } from './profile.types';

const PROFILE_COLUMNS = [
  'id',
  'profile_completion_completed',
  'name',
  'email',
  'phone',
  'date_of_birth',
  'home_address',
  'work_address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'blood_type',
  'allergies',
  'passkey_setup_completed',
  'emergency_passkey_hash',
  'trial_start_date',
  'created_at',
  'updated_at',
].join(', ');

function isNoRowsError(err: any) {
  return err?.code === 'PGRST116' || String(err?.message ?? '').includes('No rows');
}

function isAuthRelatedError(err: any) {
  const msg = String(err?.message ?? '').toLowerCase();
  const code = String(err?.code ?? '').toLowerCase();
  const status = String((err as any)?.status ?? (err as any)?.statusCode ?? '').toLowerCase();
  return (
    status === '401' ||
    status === '403' ||
    code === '401' ||
    code === '403' ||
    msg.includes('jwt') ||
    msg.includes('token') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('session')
  );
}

type FetchOptions = {
  timeoutMs?: number;
  /** Skip the ensureValidSession() pre-flight check. Use when the session is
   *  known-fresh (e.g. immediately after SIGNED_IN) to avoid blocking on the
   *  SDK's internal lock which setSession() may still hold. */
  skipSessionValidation?: boolean;
  /** When provided, use raw REST API instead of supabase.from() to avoid
   *  SDK lock contention (e.g. during login while setSession() is in-flight). */
  accessToken?: string;
};

export const ProfileService = {
  /**
   * Fetch the authoritative profile row from `mobile_users`.
   *
   * Uses AbortController so timed-out requests are actually cancelled
   * (no zombie HTTP connections left running in the background).
   *
   * Returns:
   * - `MobileUserProfile` when present/readable
   * - `null` when no row exists (new user) or RLS appears as "no rows"
   *
   * Throws on other errors.
   */
  async fetch(userId: string, options: FetchOptions = {}): Promise<MobileUserProfile | null> {
    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 10_000;

    // Ensure the SDK has a valid auth header before querying.
    // Right after login, the SDK may still be settling internally.
    // Skip this check when the session is known-fresh (e.g. SIGNED_IN handler)
    // because getSession() would block on the SDK lock that setSession() holds.
    if (!options.skipSessionValidation) {
      await ensureValidSession();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const startMs = Date.now();

      // ── Raw REST path: bypass SDK auth lock entirely ──────────────
      // Used during login when setSession() may be holding the SDK mutex.
      // supabase.from() internally calls getSession() which acquires the
      // same lock → deadlock. Raw fetch avoids this entirely.
      if (options.accessToken) {
        const url = `${supabaseUrl}/rest/v1/${TABLES.MOBILE_USERS}?id=eq.${userId}&select=${encodeURIComponent(PROFILE_COLUMNS)}`;
        const res = await fetch(url, {
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${options.accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.pgrst.object+json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const elapsed = Date.now() - startMs;

        if (res.status === 406) {
          console.log(`[Profile] REST fetch: no rows for ${userId} (${elapsed}ms)`);
          return null;
        }
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.warn(`[Profile] REST fetch error ${res.status} after ${elapsed}ms:`, errText);
          throw new Error(`Profile fetch failed: ${res.status}`);
        }

        console.log(`[Profile] REST fetch OK for ${userId} (${elapsed}ms)`);
        const row = await res.json();
        return (row ?? null) as MobileUserProfile | null;
      }

      // ── Standard SDK path ─────────────────────────────────────────
      const { data, error } = await supabase
        .from(TABLES.MOBILE_USERS)
        .select(PROFILE_COLUMNS)
        .eq('id', userId)
        .abortSignal(controller.signal)
        .single();

      clearTimeout(timeoutId);
      const elapsed = Date.now() - startMs;

      if (error) {
        if (isNoRowsError(error)) {
          console.log(`[Profile] fetch: no rows for ${userId} (${elapsed}ms)`);
          return null;
        }
        console.warn(`[Profile] fetch error after ${elapsed}ms:`, error.message);
        throw error;
      }

      console.log(`[Profile] fetch OK for ${userId} (${elapsed}ms)`);
      const row = (data ?? null) as unknown as MobileUserProfile | null;
      return row ?? null;
    } catch (e: any) {
      clearTimeout(timeoutId);

      // Convert AbortError to our standard timeout error
      if (e?.name === 'AbortError' || controller.signal.aborted) {
        throw new Error('Request timed out');
      }
      throw e;
    }
  },

  /**
   * Fetch with retry + timeout and one auth-refresh retry if needed.
   *
   * Each timed-out attempt is properly aborted via AbortController,
   * so retries don't compete with zombie requests for network bandwidth.
   */
  async fetchWithRetry(
    userId: string,
    options: {
      timeoutMs?: number;
      retries?: number; // additional retries after the first attempt
      skipSessionValidation?: boolean;
      accessToken?: string;
    } = {}
  ): Promise<MobileUserProfile | null> {
    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 10_000;
    const retries = typeof options.retries === 'number' ? options.retries : 2;
    const skipSessionValidation = options.skipSessionValidation;
    const accessToken = options.accessToken;

    let attempt = 0;
    let didRefresh = false;
    let lastError: any = null;

    while (attempt <= retries) {
      try {
        return await this.fetch(userId, { timeoutMs, skipSessionValidation, accessToken });
      } catch (e: any) {
        lastError = e;
        console.warn(`[Profile] fetchWithRetry attempt ${attempt} failed:`, e?.message);

        // If auth/session seems invalid, try a single refresh then retry.
        // Skip auth refresh when session is known-fresh (skipSessionValidation) to
        // avoid deadlocking on the Supabase SDK lock during the SIGNED_IN handler.
        if (!didRefresh && isAuthRelatedError(e) && !skipSessionValidation) {
          didRefresh = true;
          // Timeout prevents deadlock: if getSession() blocks on the SDK lock
          // (e.g. setSession() still running), we bail after 5s instead of hanging.
          const ok = await Promise.race([
            AuthService.refreshSession(),
            new Promise<boolean>(resolve => setTimeout(() => {
              console.warn('[Profile] refreshSession timed out (5s) — skipping auth retry');
              resolve(false);
            }, 5000)),
          ]);
          if (!ok) {
            throw e;
          }
          attempt++;
          continue;
        }

        attempt++;
        if (attempt > retries) break;
        // Small delay between retries to handle transient timing issues
        // (e.g. profile row not yet committed, session not fully propagated)
        await new Promise(r => setTimeout(r, 800));
      }
    }

    // ── Dashboard proxy fallback ────────────────────────────────────
    // All direct Supabase attempts failed. Try the dashboard API proxy
    // which can reach Supabase from Vercel's servers.
    if (accessToken) {
      try {
        console.log('[Profile] fetchWithRetry: all direct attempts failed — trying dashboard proxy');
        const proxyResult = await this.fetchViaDashboardProxy(accessToken, timeoutMs);
        if (proxyResult) {
          return proxyResult;
        }
      } catch (proxyErr: any) {
        console.warn('[Profile] Dashboard proxy fallback also failed:', proxyErr?.message);
      }
    }

    throw lastError ?? new Error('Profile fetch failed');
  },

  /**
   * Fetch profile through dashboard API proxy.
   * Used as a fallback when direct Supabase REST is unreachable.
   * The dashboard API uses supabaseAdmin (service role) — bypasses RLS.
   */
  async fetchViaDashboardProxy(
    accessToken: string,
    timeoutMs: number = 8_000
  ): Promise<MobileUserProfile | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${apiBaseUrl}/api/mobile/profile`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`[Profile] Dashboard proxy fetch error ${res.status}:`, errText);
        return null;
      }

      const json = await res.json();
      // API returns { success: true, data: { profile: ... } }
      const profile = json?.data?.profile ?? json?.profile ?? null;
      if (profile) {
        console.log('[Profile] Fetched via dashboard proxy');
      }
      return profile as MobileUserProfile | null;
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e?.name === 'AbortError') {
        console.warn('[Profile] Dashboard proxy fetch timed out');
      } else {
        console.warn('[Profile] Dashboard proxy fetch failed:', e?.message);
      }
      return null;
    }
  },
};
