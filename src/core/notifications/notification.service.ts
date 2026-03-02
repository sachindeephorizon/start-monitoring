/**
 * Notification Service
 *
 * Handles push notification registration, token management, and storage.
 *
 * iOS SAFETY: Push notifications are the ONLY way to wake an iOS app.
 * This service ensures tokens are properly registered and synced with the server.
 *
 * PROXY-FIRST:
 * > Token storage/deletion goes through dashboard proxy first.
 * > Direct Supabase is fallback only (ISP may block Supabase).
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { apiBaseUrl } from '@/config/environment';
import { EXPO_PUSH_TOKEN_TYPE } from './notification.constants';

/**
 * Device information for push token storage
 */
interface DeviceInfo {
  token: string;
  platform: string;
  os_version?: string;
  device_model?: string;
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
 * Notification Service
 *
 * Provides methods for push notification registration and token management.
 *
 * Proxy-first: dashboard API is always tried first, direct Supabase is fallback.
 */
export const NotificationService = {
  /**
   * Register for push notifications
   */
  async register(): Promise<string | null> {
    try {
      if (!Device.isDevice) {
        console.warn('[Notification Service] Not running on a physical device, push notifications unavailable');
        return null;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('[Notification Service] Notification permission not granted');
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '27fb532d-c0f0-45e5-919e-0e7b9a62366d',
      });

      const token = tokenData.data;

      if (!token) {
        console.error('[Notification Service] Failed to get push token');
        return null;
      }

      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        console.warn('[Notification Service] No authenticated user, cannot store token');
        return token;
      }

      await this.storeToken(token, user.id);

      console.log('[Notification Service] Push token registered:', token.substring(0, 20) + '...');
      return token;
    } catch (error) {
      console.error('[Notification Service] Error registering for push notifications:', error);
      return null;
    }
  },

  /**
   * Store push token in database
   *
   * Proxy-first: tries dashboard API, falls back to direct Supabase.
   */
  async storeToken(token: string, userId: string): Promise<void> {
    try {
      const deviceInfo: DeviceInfo = {
        token,
        platform: Platform.OS,
        os_version: Device.osVersion || undefined,
        device_model: Device.modelName || undefined,
      };

      // Try proxy first
      let accessToken: string | null = null;
      try {
        const session = await ensureValidSession();
        accessToken = (session as any)?.access_token || null;
      } catch {
        // Continue without proxy
      }

      if (accessToken) {
        try {
          const res = await proxyFetch('/api/mobile/notifications/token', accessToken, {
            method: 'POST',
            body: JSON.stringify({
              token,
              tokenType: EXPO_PUSH_TOKEN_TYPE,
              platform: deviceInfo.platform,
              osVersion: deviceInfo.os_version,
              deviceModel: deviceInfo.device_model,
            }),
          });

          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            if (data?.success) {
              console.log('[Notification Service] Push token stored via proxy');
              return;
            }
          }
          console.warn('[Notification Service] Proxy storeToken failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Notification Service] Proxy storeToken error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const payload = {
        user_id: userId,
        token: token,
        token_type: EXPO_PUSH_TOKEN_TYPE,
        platform: deviceInfo.platform,
        os_version: deviceInfo.os_version,
        device_model: deviceInfo.device_model,
        updated_at: new Date().toISOString(),
      };

      const tryUpsert = async (table: string) => {
        return await supabase.from(table).upsert(payload as any, {
          onConflict: 'user_id,token',
        });
      };

      let result = await tryUpsert('user_devices');
      if (result.error?.code === 'PGRST205') {
        result = await tryUpsert('user_agent_map');
      }

      if (result.error) {
        console.error('[Notification Service] Error storing push token:', result.error);
      }
    } catch (error) {
      console.error('[Notification Service] Error in storeToken:', error);
    }
  },

  /**
   * Unregister push notifications
   *
   * Proxy-first: tries dashboard API, falls back to direct Supabase.
   */
  async unregister(token: string, userId: string): Promise<void> {
    try {
      // Try proxy first
      let accessToken: string | null = null;
      try {
        const session = await ensureValidSession();
        accessToken = (session as any)?.access_token || null;
      } catch {
        // Continue without proxy
      }

      if (accessToken) {
        try {
          const res = await proxyFetch('/api/mobile/notifications/token', accessToken, {
            method: 'DELETE',
            body: JSON.stringify({ token }),
          });

          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            if (data?.success) {
              console.log('[Notification Service] Push token unregistered via proxy');
              return;
            }
          }
          console.warn('[Notification Service] Proxy unregister failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Notification Service] Proxy unregister error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const tryDelete = async (table: string) => {
        return await supabase.from(table).delete().eq('user_id', userId).eq('token', token);
      };

      let result = await tryDelete('user_devices');
      if (result.error?.code === 'PGRST205') {
        result = await tryDelete('user_agent_map');
      }

      if (result.error) {
        console.error('[Notification Service] Error unregistering push token:', result.error);
      }
    } catch (error) {
      console.error('[Notification Service] Error in unregister:', error);
    }
  },

  /**
   * Get current push token
   */
  async getCurrentToken(): Promise<string | null> {
    try {
      if (!Device.isDevice) {
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '27fb532d-c0f0-45e5-919e-0e7b9a62366d',
      });

      return tokenData.data || null;
    } catch (error) {
      console.error('[Notification Service] Error getting current token:', error);
      return null;
    }
  },

  /**
   * Check if notifications are enabled
   */
  async areNotificationsEnabled(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('[Notification Service] Error checking notification status:', error);
      return false;
    }
  },
};
