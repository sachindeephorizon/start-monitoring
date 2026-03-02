/**
 * Supabase query helpers (production-safe)
 *
 * Goals:
 * - Prevent indefinite spinners via timeouts
 * - Avoid duplicate in-flight requests (dedupe)
 * - Provide bounded retries with backoff
 *
 * NOTE:
 * - Supabase queries don't support AbortController uniformly; we use Promise.race timeouts.
 */
import { supabase, ensureValidSession } from '@/lib/supabase';

type RetryOptions = {
  retries?: number; // additional retries after first attempt
  baseDelayMs?: number;
  maxDelayMs?: number;
};

const inFlight = new Map<string, Promise<any>>();

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label?: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(label ? `${label}: Request timed out` : 'Request timed out');
      (err as any).code = 'TIMEOUT';
      reject(err);
    }, ms);
  });

  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  }) as Promise<T>;
}

export async function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = (async () => fn())().finally(() => {
    // Only clear if we're still the same promise.
    const current = inFlight.get(key);
    if (current === p) inFlight.delete(key);
  });

  inFlight.set(key, p);
  return p;
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = typeof opts.retries === 'number' ? opts.retries : 1;
  const baseDelayMs = typeof opts.baseDelayMs === 'number' ? opts.baseDelayMs : 300;
  const maxDelayMs = typeof opts.maxDelayMs === 'number' ? opts.maxDelayMs : 1500;

  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      attempt++;
      if (attempt > retries) break;
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      // Small jitter to prevent thundering herd.
      const jitter = Math.floor(Math.random() * 120);
      await sleep(delay + jitter);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Request failed');
}

export async function getSessionUser() {
  const session = await ensureValidSession();
  return session?.user ?? null;
}

