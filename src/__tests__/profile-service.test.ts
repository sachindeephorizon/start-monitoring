/**
 * Profile Service Tests
 *
 * Tests for ProfileService.fetch and ProfileService.fetchWithRetry.
 */

// We need to create the mock chain INSIDE the factory to avoid jest hoisting issues
let mockSingleFn: jest.Mock;

jest.mock('@/lib/supabase', () => {
  // Create the chain: supabase.from('table').select('cols').eq('id', val).abortSignal(signal).single()
  mockSingleFn = jest.fn();
  const mockAbortSignal = jest.fn(() => ({ single: mockSingleFn }));
  const mockEq = jest.fn(() => ({ abortSignal: mockAbortSignal }));
  const mockSelect = jest.fn(() => ({ eq: mockEq }));
  const mockFrom = jest.fn(() => ({ select: mockSelect }));

  return {
    supabase: {
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: 'user-123' },
              access_token: 'token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
          },
        }),
        refreshSession: jest.fn(),
      },
      from: mockFrom,
    },
    TABLES: { MOBILE_USERS: 'mobile_users' },
    ensureValidSession: jest.fn().mockResolvedValue({
      user: { id: 'user-123' },
      access_token: 'valid-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    }),
  };
});

jest.mock('@/core/auth/auth.service', () => ({
  AuthService: {
    refreshSession: jest.fn().mockResolvedValue(true),
  },
}));

import { ProfileService } from '@/core/profile/profile.service';

const fakeProfile = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  phone: '+1234567890',
  profile_completion_completed: true,
  date_of_birth: '1990-01-01',
  home_address: '123 Main St',
  work_address: '456 Work Ave',
  emergency_contact_name: 'Jane Doe',
  emergency_contact_phone: '+0987654321',
  emergency_contact_relationship: 'Spouse',
  blood_type: 'A+',
  allergies: null,
  passkey_setup_completed: false,
  emergency_passkey_hash: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
};

describe('ProfileService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetch', () => {
    it('fetches profile successfully', async () => {
      mockSingleFn.mockResolvedValue({ data: fakeProfile, error: null });

      const result = await ProfileService.fetch('user-123');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('user-123');
      expect(result!.name).toBe('Test User');
    });

    it('returns null for "no rows" error (new user)', async () => {
      mockSingleFn.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      const result = await ProfileService.fetch('user-new');
      expect(result).toBeNull();
    });

    it('throws on non-"no rows" database error', async () => {
      mockSingleFn.mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'permission denied for table mobile_users' },
      });

      await expect(ProfileService.fetch('user-123')).rejects.toMatchObject({
        message: expect.stringContaining('permission denied'),
      });
    });
  });

  describe('fetchWithRetry', () => {
    it('succeeds on first attempt', async () => {
      mockSingleFn.mockResolvedValue({ data: fakeProfile, error: null });

      const result = await ProfileService.fetchWithRetry('user-123', { retries: 2 });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('user-123');
    });

    it('retries on transient error and succeeds', async () => {
      let attempt = 0;
      mockSingleFn.mockImplementation(() => {
        attempt++;
        if (attempt <= 1) {
          return Promise.resolve({
            data: null,
            error: { message: 'network error', code: 'NETWORK' },
          });
        }
        return Promise.resolve({ data: fakeProfile, error: null });
      });

      const result = await ProfileService.fetchWithRetry('user-123', {
        retries: 2,
        timeoutMs: 5000,
      });
      expect(result).not.toBeNull();
      expect(attempt).toBeGreaterThanOrEqual(2);
    });

    it('throws after all retries exhausted', async () => {
      mockSingleFn.mockResolvedValue({
        data: null,
        error: { message: 'persistent error', code: 'UNKNOWN' },
      });

      await expect(
        ProfileService.fetchWithRetry('user-123', { retries: 1, timeoutMs: 5000 })
      ).rejects.toMatchObject({
        message: expect.stringContaining('persistent error'),
      });
    });
  });
});
