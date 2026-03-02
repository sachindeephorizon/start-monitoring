/**
 * Auth → Data Flow Integration Tests
 *
 * Tests the complete flow from authentication through data fetching,
 * verifying that:
 * 1. Session is established correctly
 * 2. ensureValidSession returns usable credentials
 * 3. Services fetch data via proxy (primary) or direct Supabase (fallback)
 * 4. Proxy-first architecture works end-to-end
 *
 * Uses mocked Supabase and fetch to simulate various network conditions.
 */

let mockEnsureValidSession: jest.Mock;
let mockGetSession: jest.Mock;
let mockFrom: jest.Mock;
let mockWaitForSdkReady: jest.Mock;

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (spec: any) => spec.ios },
}));

jest.mock('@/lib/supabase', () => {
  mockEnsureValidSession = jest.fn();
  mockGetSession = jest.fn();
  mockWaitForSdkReady = jest.fn().mockResolvedValue(true);
  mockFrom = jest.fn();
  return {
    supabase: {
      from: mockFrom,
      auth: {
        getSession: mockGetSession,
        setSession: jest.fn(),
        refreshSession: jest.fn(),
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      },
      functions: { invoke: jest.fn() },
    },
    ensureValidSession: mockEnsureValidSession,
    waitForSdkReady: mockWaitForSdkReady,
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

import { SubscriptionService } from '@/services/subscription.service';
import { HistoryService } from '@/features/history/history.service';

const originalFetch = global.fetch;

// ── Test Data ────────────────────────────────────────────────────────

const VALID_SESSION = {
  user: {
    id: 'user-test-123',
    email: 'testuser@example.com',
    phone: '+919876543210',
    user_metadata: { phone: '+919876543210' },
    created_at: '2026-02-01T00:00:00Z',
  },
  access_token: 'eyJ-valid-access-token',
  refresh_token: 'refresh-token-xyz',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};

const FAKE_SUBSCRIPTION = {
  id: 'sub-test-1',
  user_id: 'user-test-123',
  plan_id: 'plan_RIADHZ91GxVCUn',
  status: 'active',
  start_date: '2026-02-01T00:00:00Z',
  end_date: '2026-03-01T00:00:00Z',
  auto_renew: true,
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
};

function makeChain(data: any, error: any = null) {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn().mockResolvedValue({ data, error });
  chain.single = jest.fn().mockResolvedValue({ data, error });
  return chain;
}

function makeDirectHistoryChain(data: any[]) {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockResolvedValue({ data, error: null });
  return chain;
}

// ── Test Scenarios ───────────────────────────────────────────────────

describe('Auth → Data Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReset();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Scenario 1: Proxy reachable (primary path)', () => {
    beforeEach(() => {
      mockEnsureValidSession.mockResolvedValue(VALID_SESSION);
    });

    it('fetches subscription via proxy', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { subscription: FAKE_SUBSCRIPTION, isFamilyMember: false, trialStatus: null },
        }),
      });

      const { subscription, error } = await SubscriptionService.getUserSubscription();

      expect(subscription).toEqual(FAKE_SUBSCRIPTION);
      expect(error).toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      // Direct Supabase NOT called when proxy succeeds
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('fetches trial status via proxy', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            subscription: null,
            trialStatus: { isTrialActive: true, trialEndDate: '2026-02-27T00:00:00Z', daysRemaining: 4 },
          },
        }),
      });

      const result = await SubscriptionService.getTrialStatus();

      expect(result.isTrialActive).toBe(true);
      expect(result.daysRemaining).toBe(4);
      expect(result.error).toBeNull();
      expect(global.fetch).toHaveBeenCalled();
    });

    it('fetches history via proxy', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            emergencies: [{ id: 'em-1', status: 'resolved', triggered_at: '2026-02-20T10:00:00Z', created_at: '2026-02-20' }],
            checkins: [],
            trackingSessions: [],
            calls: [],
            bodyguardBookings: [],
          },
        }),
      });

      const result = await HistoryService.getAll();

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('emergency');
      expect(global.fetch).toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 2: Proxy fails, direct Supabase works (fallback)', () => {
    beforeEach(() => {
      mockEnsureValidSession.mockResolvedValue(VALID_SESSION);
      // Proxy returns 500
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal error' }),
      });
    });

    it('subscription falls back to direct Supabase', async () => {
      mockFrom.mockReturnValue(makeChain(FAKE_SUBSCRIPTION));

      const { subscription, error } = await SubscriptionService.getUserSubscription();

      expect(subscription).toEqual(FAKE_SUBSCRIPTION);
      expect(error).toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(1); // proxy tried
      expect(mockFrom).toHaveBeenCalled(); // direct fallback
    });

    it('trial status falls back to direct Supabase', async () => {
      mockFrom
        .mockReturnValueOnce(makeChain(null)) // user_subscriptions: no sub
        .mockReturnValueOnce(makeChain({ trial_start_date: '2026-02-20T00:00:00Z' })); // mobile_users

      const result = await SubscriptionService.getTrialStatus();

      expect(typeof result.isTrialActive).toBe('boolean');
      expect(typeof result.daysRemaining).toBe('number');
      expect(result.error).toBeNull();
    });

    it('history falls back to direct Supabase and transforms data', async () => {
      const fakeEmergencies = [{ id: 'em-1', status: 'resolved', triggered_at: '2026-02-20T10:00:00Z', created_at: '2026-02-20' }];
      const fakeCheckins = [{ id: 'ci-1', status: 'completed', scheduled_at: '2026-02-21T09:00:00Z', created_at: '2026-02-21' }];
      mockFrom
        .mockReturnValueOnce(makeDirectHistoryChain(fakeEmergencies))
        .mockReturnValueOnce(makeDirectHistoryChain(fakeCheckins))
        .mockReturnValueOnce(makeDirectHistoryChain([]))
        .mockReturnValueOnce(makeDirectHistoryChain([]))
        .mockReturnValueOnce(makeDirectHistoryChain([]));

      const result = await HistoryService.getAll();

      expect(result.length).toBe(2);
      expect(result.find(i => i.type === 'emergency')).toBeDefined();
      expect(result.find(i => i.type === 'checkin')).toBeDefined();
    });
  });

  describe('Scenario 3: No session (unauthenticated)', () => {
    it('subscription returns auth error', async () => {
      mockEnsureValidSession.mockResolvedValue({ user: null });

      const { subscription, error } = await SubscriptionService.getUserSubscription();

      expect(subscription).toBeNull();
      expect(error).toBeTruthy();
    });

    it('trial status returns not authenticated', async () => {
      mockEnsureValidSession.mockResolvedValue({ user: null });

      const result = await SubscriptionService.getTrialStatus();

      expect(result.isTrialActive).toBe(false);
      expect(result.error).toContain('authenticated');
    });

    it('history returns empty array', async () => {
      mockEnsureValidSession.mockResolvedValue({ user: null });

      const result = await HistoryService.getAll();

      expect(result).toEqual([]);
    });
  });

  describe('Scenario 4: Session with expired access_token (FallbackIdentity)', () => {
    it('proxy still works with FallbackIdentity token', async () => {
      mockEnsureValidSession.mockResolvedValue({
        isFallbackIdentity: true,
        user: { id: 'user-test-123', email: 'test@example.com' },
        access_token: 'possibly-expired-token',
        expires_at: Math.floor(Date.now() / 1000) - 100,
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { subscription: FAKE_SUBSCRIPTION, isFamilyMember: false, trialStatus: null },
        }),
      });

      const { subscription } = await SubscriptionService.getUserSubscription();

      expect(subscription).toEqual(FAKE_SUBSCRIPTION);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scenario 5: Proxy returns unexpected shapes', () => {
    beforeEach(() => {
      mockEnsureValidSession.mockResolvedValue(VALID_SESSION);
    });

    it('handles proxy returning empty data gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} }),
      });

      const { subscription } = await SubscriptionService.getUserSubscription();
      expect(subscription).toBeNull();
    });

    it('handles proxy returning malformed JSON — falls back to direct', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      // Direct Supabase as fallback
      mockFrom.mockReturnValue(makeChain(FAKE_SUBSCRIPTION));

      const { subscription } = await SubscriptionService.getUserSubscription();
      // Proxy JSON parse error → proxy returns error → falls back to direct
      expect(subscription).toEqual(FAKE_SUBSCRIPTION);
    });

    it('handles proxy network error — falls back to direct', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

      // Direct Supabase as fallback
      mockFrom.mockReturnValue(makeChain(FAKE_SUBSCRIPTION));

      const { subscription } = await SubscriptionService.getUserSubscription();
      expect(subscription).toEqual(FAKE_SUBSCRIPTION);
    });
  });
});
