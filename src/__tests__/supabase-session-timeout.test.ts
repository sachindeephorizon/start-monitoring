/**
 * Supabase Session & Token Timeout Tests
 *
 * Tests for the critical timeout protections added to prevent the
 * setSession() / getSession() deadlock that blocked the login flow.
 */

// Mock @supabase/supabase-js so that @/lib/supabase gets our mock client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
      setSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(),
  })),
}));

import { supabase, ensureValidSession } from '@/lib/supabase';

const mockAuth = supabase.auth as any;

describe('ensureValidSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('returns session when token has > 60 seconds left', async () => {
    const validSession = {
      user: { id: 'user-123' },
      access_token: 'valid-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    mockAuth.getSession.mockResolvedValue({ data: { session: validSession } });

    const result = await ensureValidSession();
    expect(result).toBe(validSession);
    expect(mockAuth.refreshSession).not.toHaveBeenCalled();
  });

  it('returns null when no session exists', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });

    const result = await ensureValidSession();
    expect(result).toBeNull();
  });

  it('refreshes session when token expires within 60 seconds', async () => {
    const expiringSession = {
      user: { id: 'user-123' },
      access_token: 'expiring-token',
      expires_at: Math.floor(Date.now() / 1000) + 30,
    };
    const refreshedSession = {
      user: { id: 'user-123' },
      access_token: 'new-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    mockAuth.getSession.mockResolvedValue({ data: { session: expiringSession } });
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: refreshedSession },
      error: null,
    });

    const result = await ensureValidSession();
    expect(result).toBe(refreshedSession);
    expect(mockAuth.refreshSession).toHaveBeenCalled();
  });

  it('returns marginally valid session when refresh fails', async () => {
    const expiringSession = {
      user: { id: 'user-123' },
      access_token: 'expiring-token',
      expires_at: Math.floor(Date.now() / 1000) + 10,
    };

    mockAuth.getSession.mockResolvedValue({ data: { session: expiringSession } });
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error('Network error'),
    });

    const result = await ensureValidSession();
    expect(result).toBe(expiringSession);
  });

  it('returns null when session is expired and refresh fails', async () => {
    const expiredSession = {
      user: { id: 'user-123' },
      access_token: 'expired-token',
      expires_at: Math.floor(Date.now() / 1000) - 100,
    };

    mockAuth.getSession.mockResolvedValue({ data: { session: expiredSession } });
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error('Refresh token expired'),
    });

    const result = await ensureValidSession();
    expect(result).toBeNull();
  });

  it('handles getSession() timeout (SDK lock contention)', async () => {
    jest.useFakeTimers();

    // Simulate getSession hanging forever (deadlock scenario)
    mockAuth.getSession.mockReturnValue(new Promise(() => {}));

    const promise = ensureValidSession();

    // Fast-forward past the 1s timeout
    jest.advanceTimersByTime(1500);

    const result = await promise;
    expect(result).toBeNull();

    jest.useRealTimers();
  });

  it('handles getSession() throwing an error', async () => {
    mockAuth.getSession.mockRejectedValue(new Error('LockAcquireTimeoutError'));

    const result = await ensureValidSession();
    expect(result).toBeNull();
  });

  it('handles session with missing expires_at (defaults to 0)', async () => {
    const noExpirySession = {
      user: { id: 'user-123' },
      access_token: 'no-expiry-token',
    };

    mockAuth.getSession.mockResolvedValue({ data: { session: noExpirySession } });
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error('fail'),
    });

    const result = await ensureValidSession();
    expect(result).toBeNull();
  });
});
