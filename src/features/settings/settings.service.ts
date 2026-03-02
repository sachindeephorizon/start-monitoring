/**
 * Settings Service
 * 
 * Service for settings and preferences operations.
 * 
 * iOS SAFETY: This service only handles:
 * - Reading permission status (read-only)
 * - Opening iOS Settings app (user-initiated)
 * - Notification preferences (server-stored)
 * - Account operations (logout, delete)
 * 
 * No background logic, no automatic re-requests.
 */

import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import { supabase, ensureValidSession, markExplicitSignOut } from '@/lib/supabase';
import { withTimeout } from '@/core/net/supabaseQuery';
import { PermissionStatusEntry } from './settings.types';

/**
 * Settings Service
 * 
 * Provides methods for settings operations.
 */
export const SettingsService = {
  /**
   * Get permission statuses (read-only)
   * 
   * Checks current permission status for all required permissions.
   * Does NOT request permissions - only checks status.
   * 
   * @returns Array of permission status entries
   */
  async getPermissionStatuses(): Promise<PermissionStatusEntry[]> {
    const statuses: PermissionStatusEntry[] = [];

    try {
      // Location (Always)
      const locationAlwaysStatus = await Location.getBackgroundPermissionsAsync();
      statuses.push({
        permission: 'location_always',
        displayName: 'Location (Always)',
        status: locationAlwaysStatus.granted
          ? 'granted'
          : locationAlwaysStatus.canAskAgain
            ? 'denied'
            : 'blocked',
        canOpenSettings: !locationAlwaysStatus.granted,
        explanation: 'Required for continuous safety tracking even when the app is closed.',
      });

      // Location (When In Use)
      const locationWhenInUseStatus = await Location.getForegroundPermissionsAsync();
      if (!locationAlwaysStatus.granted) {
        statuses.push({
          permission: 'location_when_in_use',
          displayName: 'Location (When In Use)',
          status: locationWhenInUseStatus.granted
            ? 'granted'
            : locationWhenInUseStatus.canAskAgain
              ? 'denied'
              : 'blocked',
          canOpenSettings: !locationWhenInUseStatus.granted,
          explanation: 'Required to capture your location during emergencies.',
        });
      }

      // Notifications
      const notificationStatus = await Notifications.getPermissionsAsync();
      statuses.push({
        permission: 'notifications',
        displayName: 'Notifications',
        status: notificationStatus.granted
          ? 'granted'
          : notificationStatus.canAskAgain
            ? 'denied'
            : 'blocked',
        canOpenSettings: !notificationStatus.granted,
        explanation: 'Required for emergency alerts, check-in reminders, and agent communications.',
      });

      // Microphone
      const audioStatus = await Audio.getPermissionsAsync();
      statuses.push({
        permission: 'microphone',
        displayName: 'Microphone',
        status: audioStatus.granted
          ? 'granted'
          : audioStatus.canAskAgain
            ? 'denied'
            : 'blocked',
        canOpenSettings: !audioStatus.granted,
        explanation: 'Required for audio calls with security agents.',
      });

      // Camera
      const cameraStatus = await Camera.getCameraPermissionsAsync();
      statuses.push({
        permission: 'camera',
        displayName: 'Camera',
        status: cameraStatus.granted
          ? 'granted'
          : cameraStatus.canAskAgain
            ? 'denied'
            : 'blocked',
        canOpenSettings: !cameraStatus.granted,
        explanation: 'Required for video calls with security agents.',
      });
    } catch (error) {
      console.error('[Settings Service] Error getting permission statuses:', error);
    }

    return statuses;
  },

  /**
   * Open iOS Settings app
   * 
   * Opens the iOS Settings app where user can change permissions.
   * Only works if permission is denied/blocked.
   * 
   * @returns Success status
   */
  async openSettings(): Promise<boolean> {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
      } else {
        await Linking.openSettings();
      }
      return true;
    } catch (error) {
      console.error('[Settings Service] Error opening settings:', error);
      return false;
    }
  },

  /**
   * Get app information
   * 
   * @returns App info (name, version, build number)
   */
  getAppInfo() {
    const appConfig = Constants.expoConfig;
    return {
      name: appConfig?.name || 'DeepHorizon Security',
      version: appConfig?.version || '1.0.0',
      buildNumber: appConfig?.ios?.buildNumber || appConfig?.android?.versionCode?.toString() || '1',
      bundleIdentifier: appConfig?.ios?.bundleIdentifier || appConfig?.android?.package || '',
    };
  },

  /**
   * Get notification preferences
   * 
   * Retrieves notification preferences from server (or defaults).
   * 
   * @returns Array of notification preferences
   */
  async getNotificationPreferences(): Promise<any[]> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return this.getDefaultNotificationPreferences();
      }

      // TODO: Fetch from user preferences table if exists
      // For now, return defaults
      return this.getDefaultNotificationPreferences();
    } catch (error) {
      console.error('[Settings Service] Error getting notification preferences:', error);
      return this.getDefaultNotificationPreferences();
    }
  },

  /**
   * Update notification preference
   * 
   * Updates a single notification preference on the server.
   * 
   * @param type Notification type
   * @param enabled Whether notification is enabled
   * @returns Success status
   */
  async updateNotificationPreference(type: string, enabled: boolean): Promise<boolean> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return false;
      }

      // TODO: Update in user preferences table
      // For now, just log
      console.log('[Settings Service] Update notification preference:', type, enabled);

      return true;
    } catch (error) {
      console.error('[Settings Service] Error updating notification preference:', error);
      return false;
    }
  },

  /**
   * Get default notification preferences
   * 
   * @returns Default notification preferences
   */
  getDefaultNotificationPreferences() {
    return [
      {
        type: 'emergency',
        enabled: true,
        label: 'Emergency Alerts',
        description: 'Critical safety alerts that cannot be disabled',
        required: true,
      },
      {
        type: 'check_in',
        enabled: true,
        label: 'Check-In Reminders',
        description: 'Notifications for scheduled check-ins',
      },
      {
        type: 'chat',
        enabled: true,
        label: 'Chat Messages',
        description: 'Notifications when agents send messages',
      },
      {
        type: 'booking',
        enabled: true,
        label: 'Booking Updates',
        description: 'Notifications for bodyguard booking status changes',
      },
      {
        type: 'call',
        enabled: true,
        label: 'Incoming Calls',
        description: 'Notifications for incoming video/audio calls',
      },
    ];
  },

  /**
   * Delete user account
   * 
   * Deletes the user account from the server.
   * This is a destructive operation and requires confirmation.
   * 
   * @returns Account deletion result
   */
  async deleteAccount(): Promise<{ success: boolean; error?: string }> {
    const TIMEOUT_MS = 30000;

    try {
      // Validate session before calling edge function
      const session = await ensureValidSession();
      if (!session?.user) {
        return {
          success: false,
          error: 'Your session has expired. Please sign in again and retry.',
        };
      }

      console.log('[Settings Service] Calling delete_user_account edge function...');
      const { data, error } = await withTimeout(
        supabase.functions.invoke('delete_user_account', { method: 'POST' }),
        TIMEOUT_MS,
        'Account deletion'
      );

      if (error) {
        console.error('[Settings Service] Edge function error:', error);

        let errorMessage = 'Failed to delete account';
        try {
          // Try to extract error from response context (FunctionsHttpError)
          const context = (error as any)?.context;
          if (context && typeof context.json === 'function') {
            const body = await Promise.race([
              context.json(),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
            ]);
            if (body?.error) {
              errorMessage = body.error;
            }
          } else if (error.message && !error.message.includes('non-2xx')) {
            errorMessage = error.message;
          }
        } catch {
          if (error.message) errorMessage = error.message;
        }

        return {
          success: false,
          error: errorMessage,
        };
      }

      // Check the data field — some responses may return { success: false }
      // without triggering the error path
      if (data && typeof data === 'object' && data.success === false) {
        console.error('[Settings Service] Edge function returned failure:', data);
        return {
          success: false,
          error: data.error || 'Account deletion failed on the server',
        };
      }

      console.log('[Settings Service] Account deleted successfully, signing out...');
      markExplicitSignOut();
      await supabase.auth.signOut();

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[Settings Service] Error deleting account:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred while deleting your account',
      };
    }
  },
};

