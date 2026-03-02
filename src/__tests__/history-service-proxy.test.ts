/**
 * History Service — Proxy-First Tests
 *
 * Tests that HistoryService.getAll() uses the dashboard proxy as the primary
 * data source, falling back to direct Supabase when the proxy fails.
 */

let mockEnsureValidSession: jest.Mock;
let mockFrom: jest.Mock;

jest.mock('@/lib/supabase', () => {
  mockEnsureValidSession = jest.fn();
  mockFrom = jest.fn();
  return {
    supabase: {
      from: mockFrom,
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      },
    },
    ensureValidSession: mockEnsureValidSession,
  };
});

jest.mock('@/config/environment', () => ({
  apiBaseUrl: 'https://test-dashboard.example.com',
}));

import { HistoryService } from '@/features/history/history.service';

const originalFetch = global.fetch;

// ── Helpers ──────────────────────────────────────────────────────────

function makeSession(userId = 'user-123') {
  return {
    user: { id: userId, email: 'test@example.com' },
    access_token: 'valid-access-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
}

function makeSuccessChain(data: any[]) {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockResolvedValue({ data, error: null });
  return chain;
}

function makeErrorChain(errorMessage: string) {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockRejectedValue(new Error(errorMessage));
  return chain;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('HistoryService proxy-first', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReset();
    global.fetch = jest.fn();
    mockEnsureValidSession.mockResolvedValue(makeSession());
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('getAll', () => {
    it('returns data via proxy (primary path)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            emergencies: [{ id: 'em-1', status: 'resolved', triggered_at: '2026-02-20T10:00:00Z', created_at: '2026-02-20' }],
            checkins: [{ id: 'ci-1', status: 'completed', scheduled_at: '2026-02-21T09:00:00Z', created_at: '2026-02-21' }],
            trackingSessions: [],
            calls: [],
            bodyguardBookings: [],
          },
        }),
      });

      const result = await HistoryService.getAll();

      expect(result.length).toBe(2);
      expect(result.find(i => i.type === 'emergency')).toBeDefined();
      expect(result.find(i => i.type === 'checkin')).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-dashboard.example.com/api/mobile/history',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-access-token',
          }),
        })
      );
      // Direct Supabase should NOT have been called
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('falls back to direct Supabase when proxy fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

      const fakeEmergencies = [{ id: 'em-1', status: 'resolved', triggered_at: '2026-02-20T10:00:00Z', created_at: '2026-02-20' }];
      mockFrom
        .mockReturnValueOnce(makeSuccessChain(fakeEmergencies))
        .mockReturnValueOnce(makeSuccessChain([]))
        .mockReturnValueOnce(makeSuccessChain([]))
        .mockReturnValueOnce(makeSuccessChain([]))
        .mockReturnValueOnce(makeSuccessChain([]));

      const result = await HistoryService.getAll();

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('emergency');
      expect(global.fetch).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalled();
    });

    it('returns empty array when both proxy and direct fail', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

      for (let i = 0; i < 5; i++) {
        mockFrom.mockReturnValueOnce(makeErrorChain('Connection refused'));
      }

      const result = await HistoryService.getAll();

      expect(result).toEqual([]);
    });

    it('does not call proxy when no access_token', async () => {
      mockEnsureValidSession.mockResolvedValue({
        user: { id: 'user-123' },
      });

      const fakeData = [{ id: 'em-1', status: 'resolved', triggered_at: '2026-02-20T10:00:00Z', created_at: '2026-02-20' }];
      mockFrom
        .mockReturnValueOnce(makeSuccessChain(fakeData))
        .mockReturnValueOnce(makeSuccessChain([]))
        .mockReturnValueOnce(makeSuccessChain([]))
        .mockReturnValueOnce(makeSuccessChain([]))
        .mockReturnValueOnce(makeSuccessChain([]));

      const result = await HistoryService.getAll();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.length).toBe(1);
    });

    it('applies filters to proxy results', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            emergencies: [
              { id: 'em-1', status: 'resolved', triggered_at: '2026-02-20T10:00:00Z', created_at: '2026-02-20' },
              { id: 'em-2', status: 'active', triggered_at: '2026-02-21T10:00:00Z', created_at: '2026-02-21' },
            ],
            checkins: [], trackingSessions: [], calls: [], bodyguardBookings: [],
          },
        }),
      });

      const result = await HistoryService.getAll({ status: 'resolved' });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('em-1');
    });

    it('returns empty when user not authenticated', async () => {
      mockEnsureValidSession.mockResolvedValue({ user: null });

      const result = await HistoryService.getAll();

      expect(result).toEqual([]);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('individual table methods', () => {
    it('getEmergencies returns data when Supabase responds', async () => {
      const data = [{ id: 'em-1', status: 'resolved' }];
      mockFrom.mockReturnValue(makeSuccessChain(data));

      const result = await HistoryService.getEmergencies('user-123');
      expect(result).toEqual(data);
    });

    it('getEmergencies returns empty array on error', async () => {
      const chain: any = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.order = jest.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } });
      mockFrom.mockReturnValue(chain);

      const result = await HistoryService.getEmergencies('user-123');
      expect(result).toEqual([]);
    });
  });
});
