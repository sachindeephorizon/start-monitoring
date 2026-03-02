/**
 * Permission Service
 * 
 * Core permission request and check logic.
 * This service talks directly to Expo APIs and normalizes iOS/Android behavior.
 * 
 * iOS SAFETY:
 * - No timers
 * - No retries
 * - No hacks
 * - Single responsibility: request/check permissions only
 * - NEVER triggers UI (that's the guard component's job)
 */

import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

import { AppPermission, PermissionStatus, PermissionCheckResult } from './permission.types';

/**
 * Permission Service
 * 
 * Centralized service for all permission operations.
 */
export class PermissionService {
  /**
   * Request a specific permission
   * 
   * @param permission The permission to request
   * @returns The status after the request
   */
  static async request(permission: AppPermission): Promise<PermissionStatus> {
    try {
      switch (permission) {
        case 'location_when_in_use': {
          const response = await Location.requestForegroundPermissionsAsync();
          return response.granted ? 'granted' : 'denied';
        }

        case 'location_always': {
          // On iOS, we need foreground permission first, then background
          // On Android, this directly requests background permission
          if (Platform.OS === 'ios') {
            // First ensure foreground permission is granted
            const foreground = await Location.requestForegroundPermissionsAsync();
            if (!foreground.granted) {
              return 'denied';
            }
            
            // Then request background permission
            const background = await Location.requestBackgroundPermissionsAsync();
            return background.granted ? 'granted' : 'denied';
          } else {
            // Android: request background permission directly
            const response = await Location.requestBackgroundPermissionsAsync();
            return response.granted ? 'granted' : 'denied';
          }
        }

        case 'notifications': {
          const response = await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
            },
          });
          return response.granted ? 'granted' : 'denied';
        }

        case 'camera': {
          const response = await Camera.requestCameraPermissionsAsync();
          return response.granted ? 'granted' : 'denied';
        }

        case 'microphone': {
          // Audio permissions are requested via expo-av
          const response = await Audio.requestPermissionsAsync();
          return response.granted ? 'granted' : 'denied';
        }

        default:
          return 'unavailable';
      }
    } catch (error) {
      console.error(`Error requesting permission ${permission}:`, error);
      return 'unavailable';
    }
  }

  /**
   * Check the current status of a permission without requesting
   * 
   * @param permission The permission to check
   * @returns The current status
   */
  static async check(permission: AppPermission): Promise<PermissionStatus> {
    try {
      switch (permission) {
        case 'location_when_in_use': {
          const status = await Location.getForegroundPermissionsAsync();
          if (status.granted) return 'granted';
          if (status.canAskAgain === false) return 'blocked';
          return 'denied';
        }

        case 'location_always': {
          const status = await Location.getBackgroundPermissionsAsync();
          if (status.granted) return 'granted';
          if (status.canAskAgain === false) return 'blocked';
          return 'denied';
        }

        case 'notifications': {
          const status = await Notifications.getPermissionsAsync();
          if (status.granted) return 'granted';
          if (status.canAskAgain === false) return 'blocked';
          return 'denied';
        }

        case 'camera': {
          const status = await Camera.getCameraPermissionsAsync();
          if (status.granted) return 'granted';
          if (status.canAskAgain === false) return 'blocked';
          return 'denied';
        }

        case 'microphone': {
          const status = await Audio.getPermissionsAsync();
          if (status.granted) return 'granted';
          if (status.canAskAgain === false) return 'blocked';
          return 'denied';
        }

        default:
          return 'unavailable';
      }
    } catch (error) {
      console.error(`Error checking permission ${permission}:`, error);
      return 'unavailable';
    }
  }

  /**
   * Check multiple permissions at once
   * 
   * @param permissions Array of permissions to check
   * @returns Array of permission check results
   */
  static async checkMultiple(
    permissions: AppPermission[]
  ): Promise<PermissionCheckResult[]> {
    const results = await Promise.all(
      permissions.map(async (permission) => ({
        permission,
        status: await this.check(permission),
      }))
    );
    return results;
  }

  /**
   * Check if all required permissions for a capability are granted
   * 
   * This is a convenience method that checks all permissions for a capability
   * without requesting them. Use this to determine if a feature can run.
   * 
   * @param requiredPermissions Array of permissions to check
   * @returns true if all permissions are granted, false otherwise
   */
  static async hasAllPermissions(
    requiredPermissions: AppPermission[]
  ): Promise<boolean> {
    const results = await this.checkMultiple(requiredPermissions);
    return results.every((result) => result.status === 'granted');
  }
}

