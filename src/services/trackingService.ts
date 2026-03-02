/**
 * Tracking Service
 *
 * Handles all database operations for the "Track Me on the Go" feature.
 * Based on the old app's trackingService.ts but adapted for new architecture.
 *
 * PROXY-FIRST:
 * > All database operations go through dashboard proxy first.
 * > Direct Supabase is fallback only (ISP may block Supabase).
 */

import { supabase, ensureValidSession } from '@/lib/supabase';
import { apiBaseUrl } from '@/config/environment';
import { verifyEmergencyPasskey } from '@/features/emergency/emergency.passkey';

export interface TrackingSession {
  id: string;
  mobile_user_id: string;
  session_name: string;
  status: 'active' | 'paused' | 'completed' | 'emergency';
  start_time: string;
  end_time: string;
  checkin_interval_minutes: number;
  use_account_passkey: boolean;
  initial_location?: any;
  last_known_location?: any;
  assigned_agent_id?: string;
  emergency_contact_phone?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
}

export interface TrackingCheckin {
  id: string;
  tracking_session_id: string;
  scheduled_time: string;
  initiated_at?: string;
  completed_at?: string;
  status: 'pending' | 'success' | 'failed' | 'timeout' | 'missed';
  passkey_attempts: number;
  passkey_correct?: boolean;
  response_time_seconds?: number;
  location_at_checkin?: any;
  agent_call_triggered?: boolean;
  agent_call_reason?: string;
  assigned_agent_id?: string;
  created_at?: string;
}

// Track active session id for background inserts
let activeSessionId: string | null = null;
export function setActiveTrackingSession(sessionId: string | null) {
  activeSessionId = sessionId;
}

/** Get access token from session (works with both SDK Session and FallbackIdentity) */
async function getAccessToken(): Promise<string | null> {
  try {
    const session = await ensureValidSession();
    return (session as any)?.access_token || null;
  } catch {
    return null;
  }
}

/** Helper to make proxy fetch with timeout */
async function proxyFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getActiveSession(): Promise<TrackingSession | null> {
  try {
    const session = await ensureValidSession();
    const user = session?.user;
    if (!user) {
      throw new Error('User not authenticated');
    }

    const accessToken = (session as any)?.access_token;

    // Proxy-first
    if (accessToken) {
      try {
        const res = await proxyFetch('/api/mobile/tracking?action=activeSession', accessToken);
        if (res.ok) {
          const json = await res.json();
          const data = json?.data || json;
          const trackingSession = data?.session ?? null;
          if (trackingSession) {
            setActiveTrackingSession(trackingSession.id);
          }
          console.log('[Tracking Service] Active session fetched via proxy');
          return trackingSession;
        }
        console.warn('[Tracking Service] Proxy getActiveSession failed, falling back');
      } catch (proxyErr: any) {
        console.warn('[Tracking Service] Proxy getActiveSession error, falling back:', proxyErr?.message);
      }
    }

    // Fallback: direct Supabase
    const { data, error } = await supabase
      .from('tracking_sessions')
      .select('*')
      .eq('mobile_user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (error && (error as any).code !== 'PGRST116') {
      throw error;
    }

    if (data) {
      setActiveTrackingSession(data.id);
    }

    return data ?? null;
  } catch (error) {
    console.error('[Tracking Service] Error getting active session:', error);
    return null;
  }
}

// Idempotent: handles unique violation (one active per user)
export async function startSession(
  intervalMinutes: number,
  endTimeISO?: string,
  startTimeISO?: string
): Promise<TrackingSession> {
  try {
    const session = await ensureValidSession();
    const user = session?.user;
    if (!user) throw new Error('User not authenticated');

    const startTime = startTimeISO ?? new Date().toISOString();
    const defaultEndTime = endTimeISO ?? new Date(new Date(startTime).getTime() + 24 * 60 * 60 * 1000).toISOString();
    const accessToken = (session as any)?.access_token;

    // Proxy-first
    if (accessToken) {
      try {
        const res = await proxyFetch('/api/mobile/tracking', accessToken, {
          method: 'POST',
          body: JSON.stringify({
            action: 'startSession',
            intervalMinutes,
            startTime,
            endTime: defaultEndTime,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const data = json?.data || json;
          if (data?.session) {
            console.log('[Tracking Service] Session started via proxy');
            setActiveTrackingSession(data.session.id);
            return data.session as TrackingSession;
          }
        }
        console.warn('[Tracking Service] Proxy startSession failed, falling back');
      } catch (proxyErr: any) {
        console.warn('[Tracking Service] Proxy startSession error, falling back:', proxyErr?.message);
      }
    }

    // Fallback: direct Supabase
    const payload: Record<string, any> = {
      mobile_user_id: user.id,
      session_name: 'Track Me on the Go',
      status: 'active',
      start_time: startTime,
      end_time: defaultEndTime,
      checkin_interval_minutes: intervalMinutes,
      use_account_passkey: true,
    };

    console.log('[Tracking Service] startSession payload:', payload);

    const { data, error } = await supabase
      .from('tracking_sessions')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('[Tracking Service] startSession insert error:', {
        code: (error as any).code,
        message: (error as any).message,
        details: (error as any).details,
        hint: (error as any).hint,
      });
      throw error;
    }

    setActiveTrackingSession((data as TrackingSession).id);
    return data as TrackingSession;
  } catch (e: any) {
    if (e?.code === '23505') {
      const existing = await getActiveSession();
      if (existing) {
        setActiveTrackingSession(existing.id);
        return existing;
      }
    }
    throw e;
  }
}

export async function completeSession(sessionId: string, lastLocation?: any): Promise<TrackingSession> {
  try {
    const session = await ensureValidSession();
    const user = session?.user;
    if (!user) {
      throw new Error('User not authenticated');
    }

    const accessToken = (session as any)?.access_token;

    // Proxy-first
    if (accessToken) {
      try {
        const res = await proxyFetch('/api/mobile/tracking', accessToken, {
          method: 'POST',
          body: JSON.stringify({
            action: 'completeSession',
            sessionId,
            lastLocation: lastLocation ?? null,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const data = json?.data || json;
          if (data?.session) {
            console.log('[Tracking Service] Session completed via proxy');
            setActiveTrackingSession(null);
            return data.session as TrackingSession;
          }
        }
        console.warn('[Tracking Service] Proxy completeSession failed, falling back');
      } catch (proxyErr: any) {
        console.warn('[Tracking Service] Proxy completeSession error, falling back:', proxyErr?.message);
      }
    }

    // Fallback: direct Supabase
    // Try with completed_at first
    try {
      const { data, error } = await supabase
        .from('tracking_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          last_known_location: lastLocation ?? null,
        })
        .eq('id', sessionId)
        .eq('mobile_user_id', user.id)
        .select('*')
        .single();

      if (error) throw error;
      setActiveTrackingSession(null);
      return data as TrackingSession;
    } catch (err: any) {
      // Fallback to end_time if completed_at doesn't exist
      const { data, error } = await supabase
        .from('tracking_sessions')
        .update({
          status: 'completed',
          end_time: new Date().toISOString(),
          last_known_location: lastLocation ?? null,
        })
        .eq('id', sessionId)
        .eq('mobile_user_id', user.id)
        .select('*')
        .single();

      if (error) throw error;
      setActiveTrackingSession(null);
      return data as TrackingSession;
    }
  } catch (error) {
    console.error('[Tracking Service] Error completing session:', error);
    throw error;
  }
}

export async function scheduleNextCheckin(sessionId: string, scheduledAtISO: string): Promise<TrackingCheckin> {
  try {
    const accessToken = await getAccessToken();

    // Proxy-first
    if (accessToken) {
      try {
        const res = await proxyFetch('/api/mobile/tracking', accessToken, {
          method: 'POST',
          body: JSON.stringify({
            action: 'scheduleCheckin',
            sessionId,
            scheduledAt: scheduledAtISO,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const data = json?.data || json;
          if (data?.checkin) {
            console.log('[Tracking Service] Tracking check-in scheduled via proxy:', data.checkin.id);
            return data.checkin as TrackingCheckin;
          }
        }
        console.warn('[Tracking Service] Proxy scheduleCheckin failed, falling back');
      } catch (proxyErr: any) {
        console.warn('[Tracking Service] Proxy scheduleCheckin error, falling back:', proxyErr?.message);
      }
    }

    // Fallback: direct Supabase
    const { data, error } = await supabase
      .from('tracking_checkins')
      .insert({
        tracking_session_id: sessionId,
        status: 'pending',
        scheduled_time: scheduledAtISO,
        passkey_attempts: 0,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[Tracking Service] Error creating tracking check-in:', error);
      throw error;
    }

    if (!data) {
      console.error('[Tracking Service] Check-in created but no data returned');
      throw new Error('Check-in creation returned no data');
    }

    console.log('[Tracking Service] Tracking check-in created via direct Supabase:', data.id);
    return data as TrackingCheckin;
  } catch (error) {
    console.error('[Tracking Service] Failed to schedule next check-in:', error);
    throw error;
  }
}

async function updateCheckinViaApi(payload: {
  checkinId: string;
  status?: 'success' | 'failed' | 'timeout' | 'missed' | 'pending';
  passkeyAttempts?: number;
  incrementAttempts?: boolean;
  autoFailOnMaxAttempts?: boolean;
}): Promise<TrackingCheckin | null> {
  const session = await ensureValidSession();
  const token = session?.access_token || '';

  if (!token) {
    console.warn('[Tracking Service] No auth token available for check-in update');
    return null;
  }

  try {
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/api/tracking/checkins/attempt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          checkinId: payload.checkinId,
          status: payload.status,
          passkeyAttempts: payload.passkeyAttempts,
          incrementAttempts: payload.incrementAttempts,
          autoFailOnMaxAttempts: payload.autoFailOnMaxAttempts,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(fetchTimeout);
    }

    if (!response.ok) {
      console.warn('[Tracking Service] Check-in update API error:', response.status);
      return null;
    }

    const raw = await response.json().catch(() => null);
    // API returns { success, data: { checkin } } or flat { success, checkin }
    const result = raw?.data || raw;
    if (!raw?.success || !result?.checkin) {
      return null;
    }
    return result.checkin as TrackingCheckin;
  } catch (error) {
    console.warn('[Tracking Service] Check-in update API error:', error);
    return null;
  }
}

export async function markCheckinResult(
  checkinId: string,
  status: 'success' | 'failed' | 'timeout' | 'missed' | 'pending',
  attemptsDelta = 0
): Promise<TrackingCheckin | null> {
  const accessToken = await getAccessToken();

  // Proxy-first: try the new generic tracking proxy
  if (accessToken) {
    try {
      const res = await proxyFetch('/api/mobile/tracking', accessToken, {
        method: 'POST',
        body: JSON.stringify({
          action: 'markCheckinResult',
          checkinId,
          status,
          attemptsDelta,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const data = json?.data || json;
        if (data?.checkin) {
          console.log('[Tracking Service] Check-in result marked via proxy');
          return data.checkin as TrackingCheckin;
        }
      }
      console.warn('[Tracking Service] Proxy markCheckinResult failed, falling back');
    } catch (proxyErr: any) {
      console.warn('[Tracking Service] Proxy markCheckinResult error, falling back:', proxyErr?.message);
    }
  }

  // Fallback: existing API + direct Supabase
  const { data: existingCheckIn, error: fetchError } = await supabase
    .from('tracking_checkins')
    .select('id, status, passkey_attempts')
    .eq('id', checkinId)
    .single();

  if (fetchError || !existingCheckIn) {
    console.warn(`[Tracking Service] Check-in ${checkinId} not found in database. Cannot update status to ${status}.`);
    return null;
  }

  const apiResult = await updateCheckinViaApi({
    checkinId,
    status,
    passkeyAttempts: attemptsDelta > 0 ? attemptsDelta : undefined,
    incrementAttempts: attemptsDelta < 0,
    autoFailOnMaxAttempts: true,
  }).catch(() => null);

  if (apiResult) {
    return apiResult;
  }

  const updatePayload: Record<string, any> = { status };
  if (attemptsDelta > 0) {
    updatePayload.passkey_attempts = attemptsDelta;
  }

  const { data, error } = await supabase
    .from('tracking_checkins')
    .update(updatePayload)
    .eq('id', checkinId)
    .select('*')
    .single();

  if (error) {
    if ((error as any).code === 'PGRST116') {
      console.warn(
        `[Tracking Service] Check-in ${checkinId} update returned no rows (likely RLS). Assuming success for status ${status}.`
      );
      return {
        ...(existingCheckIn as TrackingCheckin),
        ...updatePayload,
        passkey_attempts:
          updatePayload.passkey_attempts ?? existingCheckIn.passkey_attempts ?? 0,
      } as TrackingCheckin;
    }
    throw error;
  }

  if (!data) {
    return {
      ...(existingCheckIn as TrackingCheckin),
      ...updatePayload,
      passkey_attempts:
        updatePayload.passkey_attempts ?? existingCheckIn.passkey_attempts ?? 0,
    } as TrackingCheckin;
  }

  return data as TrackingCheckin;
}

export async function insertUserLocation(lat: number, lon: number) {
  // Prefer writing to tracking_locations with active session id to satisfy RLS
  if (!activeSessionId) {
    return null;
  }

  const accessToken = await getAccessToken();

  // Proxy-first
  if (accessToken) {
    try {
      const res = await proxyFetch('/api/mobile/tracking', accessToken, {
        method: 'POST',
        body: JSON.stringify({
          action: 'insertLocation',
          sessionId: activeSessionId,
          latitude: lat,
          longitude: lon,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const data = json?.data || json;
        if (data?.location) {
          return data.location;
        }
      }
      console.warn('[Tracking Service] Proxy insertLocation failed, falling back');
    } catch (proxyErr: any) {
      console.warn('[Tracking Service] Proxy insertLocation error, falling back:', proxyErr?.message);
    }
  }

  // Fallback: direct Supabase
  const { data, error } = await supabase
    .from('tracking_locations')
    .insert({ tracking_session_id: activeSessionId, latitude: lat, longitude: lon })
    .select('*')
    .single();
  if (!error) return data;
  console.warn('[Tracking Service] insertUserLocation tracking_locations failed:', error?.code || error?.message || error);

  return null;
}

export async function validatePasskey(passkey: string): Promise<boolean> {
  try {
    // Use the emergency passkey validation (same passkey system)
    return await verifyEmergencyPasskey(passkey);
  } catch (error) {
    console.error('[Tracking Service] Error validating passkey:', error);
    return false;
  }
}

export async function getTrackingCheckinStats(sessionId: string): Promise<{ success: number; failed: number }> {
  const accessToken = await getAccessToken();

  // Proxy-first
  if (accessToken) {
    try {
      const res = await proxyFetch(`/api/mobile/tracking?action=checkinStats&sessionId=${sessionId}`, accessToken);
      if (res.ok) {
        const json = await res.json();
        const data = json?.data || json;
        if (data?.stats) {
          console.log('[Tracking Service] Check-in stats fetched via proxy');
          return data.stats;
        }
      }
      console.warn('[Tracking Service] Proxy checkinStats failed, falling back');
    } catch (proxyErr: any) {
      console.warn('[Tracking Service] Proxy checkinStats error, falling back:', proxyErr?.message);
    }
  }

  // Fallback: direct Supabase
  const successStatuses = new Set(['success', 'completed', 'verified']);
  const failedStatuses = new Set(['failed', 'timeout', 'missed']);
  try {
    const { data, error } = await supabase
      .from('tracking_checkins')
      .select('status')
      .eq('tracking_session_id', sessionId);

    if (error) throw error;

    const stats = { success: 0, failed: 0 };
    (data || []).forEach((row: any) => {
      const status = String(row.status ?? '').trim().toLowerCase();
      if (successStatuses.has(status)) {
        stats.success += 1;
      } else if (failedStatuses.has(status)) {
        stats.failed += 1;
      }
    });
    return stats;
  } catch (error) {
    console.error('[Tracking Service] Error fetching tracking check-in stats:', error);
    return { success: 0, failed: 0 };
  }
}

export async function getTrackingCheckinById(checkInId: string): Promise<TrackingCheckin | null> {
  const accessToken = await getAccessToken();

  // Proxy-first
  if (accessToken) {
    try {
      const res = await proxyFetch(`/api/mobile/tracking?action=checkinById&id=${checkInId}`, accessToken);
      if (res.ok) {
        const json = await res.json();
        const data = json?.data || json;
        console.log('[Tracking Service] Check-in fetched by ID via proxy');
        return (data?.checkin as TrackingCheckin) ?? null;
      }
      console.warn('[Tracking Service] Proxy checkinById failed, falling back');
    } catch (proxyErr: any) {
      console.warn('[Tracking Service] Proxy checkinById error, falling back:', proxyErr?.message);
    }
  }

  // Fallback: direct Supabase
  try {
    const { data, error } = await supabase
      .from('tracking_checkins')
      .select('*')
      .eq('id', checkInId)
      .single();

    if (error) {
      if ((error as any).code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data as TrackingCheckin;
  } catch (error) {
    console.error('[Tracking Service] Error fetching tracking check-in by id:', error);
    return null;
  }
}

export async function getCheckInHistory(sessionId: string): Promise<TrackingCheckin[]> {
  const accessToken = await getAccessToken();

  // Proxy-first
  if (accessToken) {
    try {
      const res = await proxyFetch(`/api/mobile/tracking?action=checkinHistory&sessionId=${sessionId}`, accessToken);
      if (res.ok) {
        const json = await res.json();
        const data = json?.data || json;
        console.log('[Tracking Service] Check-in history fetched via proxy');
        return (data?.checkins as TrackingCheckin[]) ?? [];
      }
      console.warn('[Tracking Service] Proxy checkinHistory failed, falling back');
    } catch (proxyErr: any) {
      console.warn('[Tracking Service] Proxy checkinHistory error, falling back:', proxyErr?.message);
    }
  }

  // Fallback: direct Supabase
  try {
    const { data, error } = await supabase
      .from('tracking_checkins')
      .select('*')
      .eq('tracking_session_id', sessionId)
      .order('scheduled_time', { ascending: false })
      .limit(20);

    if (error) throw error;

    return (data || []) as TrackingCheckin[];
  } catch (error) {
    console.error('[Tracking Service] Error fetching check-in history:', error);
    return [];
  }
}
