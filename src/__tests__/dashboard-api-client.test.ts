/**
 * Dashboard API Client Tests
 *
 * Tests for dashboardApiClient.ts — emergency creation, video call requests,
 * agent assignment, and chat initiation.
 */

let mockGetSession: jest.Mock;

jest.mock('@/lib/supabase', () => {
  mockGetSession = jest.fn();
  return {
    supabase: {
      auth: {
        getSession: mockGetSession,
        refreshSession: jest.fn(),
        setSession: jest.fn(),
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      },
      from: jest.fn(),
    },
  };
});

jest.mock('@/config/environment', () => ({
  apiBaseUrl: 'https://test-dashboard.example.com',
}));

import { dashboardApiClient } from '@/services/dashboardApiClient';

const originalFetch = global.fetch;

describe('DashboardApiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function setupValidSession() {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'valid-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    });
  }

  describe('createEmergency', () => {
    it('creates emergency and extracts ID from nested response', async () => {
      setupValidSession();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            emergency: { id: 'em-123', status: 'active' },
          }),
      });

      const result = await dashboardApiClient.createEmergency({
        mobileUserId: 'user-123',
        description: 'Test emergency',
        priority: 'emergency',
      });

      expect(result.success).toBe(true);
      expect(result.emergencyId).toBe('em-123');
    });

    it('uses top-level emergencyId when present', async () => {
      setupValidSession();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            emergencyId: 'em-456',
          }),
      });

      const result = await dashboardApiClient.createEmergency({
        mobileUserId: 'user-123',
      });

      expect(result.emergencyId).toBe('em-456');
    });

    it('returns auth error when no session available', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const result = await dashboardApiClient.createEmergency({
        mobileUserId: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not authenticated');
    });

    it('returns auth error when session is expired', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'expired-token',
            expires_at: Math.floor(Date.now() / 1000) - 100,
          },
        },
      });

      const result = await dashboardApiClient.createEmergency({
        mobileUserId: 'user-123',
      });

      expect(result.success).toBe(false);
    });

    it('handles fetch timeout (AbortError)', async () => {
      setupValidSession();

      (global.fetch as jest.Mock).mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
      );

      const result = await dashboardApiClient.createEmergency({
        mobileUserId: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('aborted');
    });

    it('handles non-OK HTTP response', async () => {
      setupValidSession();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ success: false, error: 'Internal server error' }),
      });

      const result = await dashboardApiClient.createEmergency({
        mobileUserId: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('requestVideoCall', () => {
    it('requests video call successfully', async () => {
      setupValidSession();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, sessionId: 'vs-123' }),
      });

      const result = await dashboardApiClient.requestVideoCall({
        userId: 'user-123',
        userName: 'Test User',
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('vs-123');
    });
  });

  describe('initiateChat', () => {
    it('initiates chat successfully', async () => {
      setupValidSession();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            chatRequestId: 'cr-123',
            assignedAgentId: 'agent-456',
            status: 'assigned',
          }),
      });

      const result = await dashboardApiClient.initiateChat({
        mobileUserId: 'user-123',
        category: 'general',
        priority: 'medium',
      });

      expect(result.success).toBe(true);
      expect(result.chatRequestId).toBe('cr-123');
      expect(result.assignedAgentId).toBe('agent-456');
    });
  });

  describe('getSession timeout protection', () => {
    it('handles getSession timeout gracefully', async () => {
      jest.useFakeTimers();

      mockGetSession.mockReturnValue(new Promise(() => {}));

      const promise = dashboardApiClient.createEmergency({
        mobileUserId: 'user-123',
      });

      jest.advanceTimersByTime(1500);

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('Not authenticated');

      jest.useRealTimers();
    });
  });
});
