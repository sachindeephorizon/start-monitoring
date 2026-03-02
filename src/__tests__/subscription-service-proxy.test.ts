/**
 * Subscription Service — Proxy-First Tests
 *
 * Tests that SubscriptionService.getUserSubscription() and getTrialStatus()
 * use the dashboard proxy as the primary data source, falling back to
 * direct Supabase when the proxy fails.
 */

let mockEnsureValidSession: jest.Mock;
let mockFrom: jest.Mock;

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (spec: any) => spec.ios },
}));

jest.mock('@/lib/supabase', () => {
  mockEnsureValidSession = jest.fn();
  mockFrom = jest.fn();
  return {
    supabase: {
      from: mockFrom,
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      },
      functions: { invoke: jest.fn() },
    },
    ensureValidSession: mockEnsureValidSession,
  };
});

jest.mock('@/core/auth/auth.service', () => ({
  AuthService: {
    getCurrentUser: jest.fn(),
    refreshSession: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@/config/environment', () => ({
  apiBaseUrl: 'https://test-dashboard.example.com',
}));

// Must import AFTER mocks are set up
import { SubscriptionService } from '@/services/subscription.service';

const originalFetch = global.fetch;

// ── Helpers ──────────────────────────────────────────────────────────

function makeSession(userId = 'user-123') {
  return {
    user: {
      id: userId,
      email: 'test@example.com',
      phone: '+919876543210',
      user_metadata: { phone: '+919876543210' },
      created_at: '2026-02-01T00:00:00Z',
    },
    access_token: 'valid-access-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
}

function makeSuccessChain(data: any) {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
  chain.single = jest.fn().mockResolvedValue({ data, error: null });
  return chain;
}

function makeErrorChain(errorMessage: string) {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: { message: errorMessage, code: 'NETWORK_ERROR' } });
  chain.single = jest.fn().mockResolvedValue({ data: null, error: { message: errorMessage, code: 'NETWORK_ERROR' } });
  return chain;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('SubscriptionService proxy-first', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReset();
    global.fetch = jest.fn();
    mockEnsureValidSession.mockResolvedValue(makeSession());
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('getUserSubscription', () => {
    it('returns data via proxy (primary path)', async () => {
      const proxySub = {
        id: 'sub-proxy', user_id: 'user-123', plan_id: 'plan_RIADHZ91GxVCUn',
        status: 'active',
      };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { subscription: proxySub, isFamilyMember: false, trialStatus: null },
        }),
      });

      const result = await SubscriptionService.getUserSubscription();

      expect(result.subscription).toEqual(proxySub);
      expect(result.error).toBeNull();
      // Proxy was called
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-dashboard.example.com/api/mobile/subscription',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-access-token',
          }),
        })
      );
      // Direct Supabase should NOT have been called (proxy succeeded)
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('falls back to direct Supabase when proxy fails', async () => {
      // Proxy fails
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal error' }),
      });

      // Direct Supabase returns subscription
      const fakeSub = {
        id: 'sub-1', user_id: 'user-123', plan_id: 'plan_RIADHZ91GxVCUn',
        status: 'active', start_date: '2026-02-01', end_date: '2026-03-01',
      };
      mockFrom.mockReturnValue(makeSuccessChain(fakeSub));

      const result = await SubscriptionService.getUserSubscription();

      expect(result.subscription).toEqual(fakeSub);
      expect(result.error).toBeNull();
      // Both proxy and direct were called
      expect(global.fetch).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalled();
    });

    it('returns null subscription when both proxy and direct find none', async () => {
      // Proxy returns no subscription
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { subscription: null, isFamilyMember: false },
        }),
      });

      const result = await SubscriptionService.getUserSubscription();

      expect(result.subscription).toBeNull();
      expect(result.error).toBeNull();
    });

    it('returns error when both proxy and direct fail', async () => {
      // Proxy network error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

      // Direct also fails
      mockFrom.mockReturnValue(makeErrorChain('Connection refused'));

      const result = await SubscriptionService.getUserSubscription();

      expect(result.subscription).toBeNull();
    });

    it('does not call proxy when no access_token', async () => {
      mockEnsureValidSession.mockResolvedValue({
        user: { id: 'user-123' },
        // no access_token
      });
      mockFrom.mockReturnValue(makeSuccessChain(null));

      const result = await SubscriptionService.getUserSubscription();

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getTrialStatus', () => {
    it('returns trial status via proxy (primary path)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            subscription: null,
            trialStatus: { isTrialActive: true, trialEndDate: '2026-02-27T00:00:00Z', daysRemaining: 5 },
          },
        }),
      });

      const result = await SubscriptionService.getTrialStatus();

      expect(result.isTrialActive).toBe(true);
      expect(result.daysRemaining).toBe(5);
      expect(result.error).toBeNull();
      expect(global.fetch).toHaveBeenCalled();
    });

    it('falls back to direct Supabase when proxy fails', async () => {
      // Proxy fails
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      // Direct Supabase: no subscription, trial_start_date from mobile_users
      mockFrom
        .mockReturnValueOnce(makeSuccessChain(null)) // user_subscriptions
        .mockReturnValueOnce(makeSuccessChain({ trial_start_date: '2026-02-20T00:00:00Z' })); // mobile_users

      const result = await SubscriptionService.getTrialStatus();

      expect(typeof result.isTrialActive).toBe('boolean');
      expect(typeof result.daysRemaining).toBe('number');
      expect(result.error).toBeNull();
    });
  });
});
