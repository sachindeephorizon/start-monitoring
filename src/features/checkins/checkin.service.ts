/**
 * Check-In Service
 *
 * Core check-in scheduling and completion logic. This service handles
 * user intent only - the server handles all scheduling, notifications,
 * and escalation.
 *
 * iOS SAFETY RULES (CRITICAL):
 * - App never schedules timers or waits for check-in times
 * - App only schedules intent (when check-in should occur)
 * - Server sends push notifications when check-in is due
 * - App responds to push notifications to complete check-ins
 * - Server handles all deadline checking and escalation
 *
 * DESIGN PRINCIPLE:
 * > The app NEVER waits for a check-in time.
 * > The server ALWAYS decides if a check-in is due, missed, or escalated.
 *
 * PROXY-FIRST:
 * > All database operations go through dashboard proxy first.
 * > Direct Supabase is fallback only (ISP may block Supabase).
 */

import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { apiBaseUrl } from '@/config/environment';
import { NOTIFICATION_CHANNELS } from '@/core/notifications/notification.constants';
import { getSessionUser, withTimeout } from '@/core/net/supabaseQuery';
import { QueryCache } from '@/core/net/queryCache';
import {
  CheckInPayload,
  CheckInSchedulingResult,
  CheckInCompletionResult,
  CheckIn,
  CheckInStatus,
} from './checkin.types';

/** Invalidate the pending check-ins cache so useCheckIn hook gets fresh data */
async function invalidatePendingCheckInsCache() {
  try {
    const user = await getSessionUser().catch(() => null);
    if (user) {
      await QueryCache.remove(`deephorizon.cache.checkins.pending.v1.${user.id}`);
    }
  } catch {
    // Best-effort
  }
}

const NOTIF_KEY_PREFIX = 'deephorizon.checkins.local_notif.v1';

function notifKeyForCheckIn(checkInId: string) {
  return `${NOTIF_KEY_PREFIX}.${checkInId}`;
}

async function scheduleLocalCheckInNotification(checkInId: string, scheduledAtIso: string) {
  try {
    const scheduledAt = new Date(scheduledAtIso);
    if (Number.isNaN(scheduledAt.getTime())) return;

    // If permissions are not granted, request once; if denied, skip silently.
    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) {
      const req = await Notifications.requestPermissionsAsync();
      if (!req.granted) return;
    }

    const id = await Notifications.scheduleNotificationAsync({
      // expo-notifications typing doesn't always expose platform-specific fields.
      // We still pass Android channelId at runtime for reliability.
      content: ({
        title: 'Security Check-In',
        body: 'Enter your passkey to verify your safety.',
        sound: true,
        android: {
          channelId: NOTIFICATION_CHANNELS.check_ins,
        },
        data: {
          // Reuse the same routing contract as push notifications.
          type: 'check_in',
          entity_id: checkInId,
        },
      } as any),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: scheduledAt },
    });

    await AsyncStorage.setItem(notifKeyForCheckIn(checkInId), id);
  } catch (e) {
    // Best-effort only; do not fail scheduling.
    console.warn('[Check-In Service] Unable to schedule local check-in notification (non-fatal):', e);
  }
}

async function cancelLocalCheckInNotification(checkInId: string) {
  try {
    const id = await AsyncStorage.getItem(notifKeyForCheckIn(checkInId));
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(notifKeyForCheckIn(checkInId));
    }
  } catch (e) {
    // Best-effort.
    console.warn('[Check-In Service] Unable to cancel local check-in notification (non-fatal):', e);
  }
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

/**
 * Check-In Service
 *
 * Provides methods for check-in operations.
 * All scheduling, deadline checking, and escalation logic runs server-side.
 *
 * Proxy-first: dashboard API is always tried first, direct Supabase is fallback.
 */
export const CheckInService = {
  /**
   * Schedule a check-in
   */
  async schedule(payload: CheckInPayload): Promise<CheckInSchedulingResult> {
    try {
      // Get current user
      const user = await getSessionUser();
      if (!user) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Validate scheduled time is in the future
      const scheduledAt = new Date(payload.scheduled_at);
      if (scheduledAt <= new Date()) {
        return {
          success: false,
          error: 'Scheduled time must be in the future',
        };
      }

      const accessToken = await getAccessToken();

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch('/api/mobile/checkins', accessToken, {
            method: 'POST',
            body: JSON.stringify({
              scheduled_at: payload.scheduled_at,
              message: payload.message,
              location: payload.location,
            }),
          });

          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            if (data?.success && data?.checkInId) {
              console.log('[Check-In Service] Check-in scheduled via proxy:', data.checkInId);
              await scheduleLocalCheckInNotification(data.checkInId, payload.scheduled_at);
              return { success: true, checkInId: data.checkInId };
            }
          }
          console.warn('[Check-In Service] Proxy schedule failed, falling back to direct Supabase');
        } catch (proxyErr: any) {
          console.warn('[Check-In Service] Proxy schedule error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const checkInData: any = {
        mobile_user_id: user.id,
        scheduled_at: payload.scheduled_at,
        status: 'pending',
        notes: payload.message || null,
        passkey_attempts: 0,
      };

      if (payload.location) {
        checkInData.location_at_checkin = {
          latitude: payload.location.latitude,
          longitude: payload.location.longitude,
          description: payload.location.description,
        };
      }

      const { data, error } = await withTimeout(
        supabase
        .from('checkins')
        .insert(checkInData)
        .select('id')
        .single(),
        12_000,
        'checkins.schedule'
      );

      if (error) {
        console.error('[Check-In Service] Failed to schedule check-in:', error);
        return {
          success: false,
          error: error.message || 'Failed to schedule check-in',
        };
      }

      if (!data?.id) {
        return {
          success: false,
          error: 'Check-in scheduled but no ID returned',
        };
      }

      console.log('[Check-In Service] Check-in scheduled via direct Supabase:', data.id);
      await scheduleLocalCheckInNotification(data.id, payload.scheduled_at);

      return {
        success: true,
        checkInId: data.id,
      };
    } catch (error: any) {
      console.error('[Check-In Service] Unexpected error scheduling check-in:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  },

  /**
   * Complete a check-in
   */
  async complete(
    checkInId: string,
    captureLocation: boolean = false
  ): Promise<CheckInCompletionResult> {
    try {
      // Get current user
      const user = await getSessionUser();
      if (!user) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Capture location if requested (independent of proxy/direct)
      let locationData: any = null;
      if (captureLocation) {
        try {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });

          locationData = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy || undefined,
            timestamp: new Date().toISOString(),
          };
        } catch (locationError) {
          console.warn('[Check-In Service] Location capture failed, completing without location:', locationError);
        }
      }

      const accessToken = await getAccessToken();

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch('/api/mobile/checkins', accessToken, {
            method: 'PATCH',
            body: JSON.stringify({
              action: 'complete',
              checkInId,
              location: locationData,
            }),
          });

          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            if (data?.success) {
              console.log(`[Check-In Service] Check-in ${checkInId} completed via proxy.`);
              await cancelLocalCheckInNotification(checkInId);
              await invalidatePendingCheckInsCache();
              return { success: true };
            }
          }
          console.warn('[Check-In Service] Proxy complete failed, falling back to direct Supabase');
        } catch (proxyErr: any) {
          console.warn('[Check-In Service] Proxy complete error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const { data: currentCheckIn, error: fetchError } = await withTimeout(
        supabase.from('checkins').select('*').eq('id', checkInId).single(),
        12_000,
        'checkins.getForComplete'
      );

      if (fetchError || !currentCheckIn) {
        return {
          success: false,
          error: 'Check-in not found',
        };
      }

      const attempts = (currentCheckIn.passkey_attempts || 0) + 1;
      const startTime = new Date(currentCheckIn.scheduled_at);
      const responseTime = Math.floor((Date.now() - startTime.getTime()) / 1000);

      const updateData: any = {
        status: 'completed',
        checked_in_at: new Date().toISOString(),
        passkey_correct: true,
        passkey_attempts: attempts,
        response_time_seconds: responseTime,
        updated_at: new Date().toISOString(),
      };

      if (locationData) {
        updateData.location_at_checkin = locationData;
      }

      const { error } = await withTimeout(
        supabase.from('checkins').update(updateData).eq('id', checkInId).eq('mobile_user_id', user.id),
        12_000,
        'checkins.complete'
      );

      if (error) {
        console.error('[Check-In Service] Failed to complete check-in:', error);
        return {
          success: false,
          error: error.message || 'Failed to complete check-in',
        };
      }

      await cancelLocalCheckInNotification(checkInId);

      console.log(`[Check-In Service] Check-in ${checkInId} completed via direct Supabase.`);

      await invalidatePendingCheckInsCache();

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[Check-In Service] Unexpected error completing check-in:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  },

  /**
   * Get pending check-in for user
   */
  async getPendingCheckIn(): Promise<CheckIn | null> {
    try {
      const user = await getSessionUser();
      if (!user) {
        return null;
      }

      const accessToken = await getAccessToken();

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch('/api/mobile/checkins?action=pending', accessToken);
          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            console.log('[Check-In Service] Pending check-in fetched via proxy');
            return (data?.checkin as CheckIn) ?? null;
          }
          console.warn('[Check-In Service] Proxy getPending failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Check-In Service] Proxy getPending error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const { data, error } = await withTimeout(
        supabase
        .from('checkins')
        .select('*')
        .eq('mobile_user_id', user.id)
        .in('status', ['pending', 'active'])
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .single(),
        12_000,
        'checkins.getPending'
      );

      if (error || !data) {
        return null;
      }

      return data as CheckIn;
    } catch (error) {
      console.error('[Check-In Service] Error getting pending check-in:', error);
      return null;
    }
  },

  /**
   * Get check-in by ID
   */
  async getCheckIn(checkInId: string): Promise<CheckIn | null> {
    try {
      const user = await getSessionUser();
      if (!user) {
        return null;
      }

      const accessToken = await getAccessToken();

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch(`/api/mobile/checkins?id=${checkInId}`, accessToken);
          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            console.log('[Check-In Service] Check-in fetched via proxy');
            return (data?.checkin as CheckIn) ?? null;
          }
          console.warn('[Check-In Service] Proxy getCheckIn failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Check-In Service] Proxy getCheckIn error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const { data, error } = await withTimeout(
        supabase.from('checkins').select('*').eq('id', checkInId).eq('mobile_user_id', user.id).single(),
        12_000,
        'checkins.getById'
      );

      if (error || !data) {
        return null;
      }

      return data as CheckIn;
    } catch (error) {
      console.error('[Check-In Service] Error getting check-in:', error);
      return null;
    }
  },

  /**
   * Cancel a check-in
   */
  async cancel(checkInId: string): Promise<boolean> {
    try {
      const user = await getSessionUser();
      if (!user) {
        return false;
      }

      const accessToken = await getAccessToken();

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch('/api/mobile/checkins', accessToken, {
            method: 'PATCH',
            body: JSON.stringify({
              action: 'cancel',
              checkInId,
            }),
          });

          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            if (data?.success) {
              console.log('[Check-In Service] Check-in cancelled via proxy');
              await cancelLocalCheckInNotification(checkInId);
              await invalidatePendingCheckInsCache();
              return true;
            }
          }
          console.warn('[Check-In Service] Proxy cancel failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Check-In Service] Proxy cancel error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const { error } = await withTimeout(
        supabase
          .from('checkins')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
          })
          .eq('id', checkInId)
          .eq('mobile_user_id', user.id),
        12_000,
        'checkins.cancel'
      );

      if (error) {
        console.error('[Check-In Service] Failed to cancel check-in:', error);
        return false;
      }

      await cancelLocalCheckInNotification(checkInId);
      await invalidatePendingCheckInsCache();
      return true;
    } catch (error) {
      console.error('[Check-In Service] Error cancelling check-in:', error);
      return false;
    }
  },

  /**
   * Get all check-ins for user
   */
  async getAllCheckIns(status?: CheckInStatus): Promise<CheckIn[]> {
    try {
      const user = await getSessionUser();
      if (!user) {
        return [];
      }

      const accessToken = await getAccessToken();

      // Proxy-first
      if (accessToken) {
        try {
          const params = status ? `?status=${status}` : '';
          const res = await proxyFetch(`/api/mobile/checkins${params}`, accessToken);
          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            console.log('[Check-In Service] All check-ins fetched via proxy');
            return (data?.checkins as CheckIn[]) ?? [];
          }
          console.warn('[Check-In Service] Proxy getAllCheckIns failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Check-In Service] Proxy getAllCheckIns error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      let query = supabase
        .from('checkins')
        .select('*')
        .eq('mobile_user_id', user.id)
        .order('scheduled_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await withTimeout(query, 12_000, 'checkins.getAll');

      if (error || !data) {
        return [];
      }

      return data as CheckIn[];
    } catch (error) {
      console.error('[Check-In Service] Error getting check-ins:', error);
      return [];
    }
  },

  /**
   * Mark a check-in as missed
   */
  async markMissed(checkInId: string): Promise<boolean> {
    try {
      const user = await getSessionUser();
      if (!user) {
        return false;
      }

      const accessToken = await getAccessToken();

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch('/api/mobile/checkins', accessToken, {
            method: 'PATCH',
            body: JSON.stringify({
              action: 'markMissed',
              checkInId,
            }),
          });

          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            if (data?.success) {
              console.log(`[Check-In Service] Check-in ${checkInId} marked as missed via proxy.`);
              await invalidatePendingCheckInsCache();
              return true;
            }
          }
          console.warn('[Check-In Service] Proxy markMissed failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Check-In Service] Proxy markMissed error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const { error } = await withTimeout(
        supabase
          .from('checkins')
          .update({
            status: 'missed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', checkInId)
          .eq('mobile_user_id', user.id),
        12_000,
        'checkins.markMissed'
      );

      if (error) {
        console.error('[Check-In Service] Failed to mark check-in as missed:', error);
        return false;
      }

      console.log(`[Check-In Service] Check-in ${checkInId} marked as missed via direct Supabase.`);
      await invalidatePendingCheckInsCache();
      return true;
    } catch (error) {
      console.error('[Check-In Service] Error marking check-in as missed:', error);
      return false;
    }
  },
};
