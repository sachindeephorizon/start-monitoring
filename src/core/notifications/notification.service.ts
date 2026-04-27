import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { EXPO_PUSH_TOKEN_TYPE } from './notification.constants';
import { createUserDevice, unregisterDevice } from '@/api/notifications';
import { AuthSession } from '@/core/auth';


// Read the EAS project ID from app config at runtime so this can never drift
// from app.json's `extra.eas.projectId`. Hardcoding it caused a real bug:
// the constant was pointing at the EAS Updates URL id (dffb… vs 27fb…),
// which Expo's push service rejects as "Project not found" on Android.
//
// Falls back to the configured EAS project ID `dffb010e-…` so dev builds
// work even if Constants.expoConfig.extra is somehow empty (e.g. running
// under Metro before app.config.ts has merged its `extra`).
export const PROJECT_ID =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId ||
  Constants.easConfig?.projectId ||
  'dffb010e-d230-4ff0-9124-f31c2ee40d00';


interface DeviceInfo {
  token: string;
  platform: string;
  os_version?: string;
  device_model?: string;
}

export const NotificationService = {
  async register(): Promise<string | null> {
    try {
      if (!Device.isDevice) return null;

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') return null;

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: PROJECT_ID,
      });

      const token = tokenData.data;
      if (!token) return null;

      const session = await AuthSession.load();
      const userId = session?.user?.id;

      if (userId) {
        await this.storeToken(token, userId);
      }

      return token;
    } catch (error: any) {
      // Surface the actual cause so the next failure is debuggable. Common
      // Android failure modes:
      //   • "Project not found" / "Invalid projectId" — projectId mismatch
      //     between this file and app.json's extra.eas.projectId
      //   • "Default FirebaseApp is not initialized" — google-services.json
      //     missing from the build or expo-build-properties not configured
      //   • "MissingPermissionsException" — POST_NOTIFICATIONS denied
      console.error(
        `[Notification Service] register failed using projectId=${PROJECT_ID}: ` +
          `${error?.code ?? 'unknown'} ${error?.message ?? error}`,
      );
      return null;
    }
  },

  async storeToken(token: string, userId: string): Promise<void> {
    try {
      const deviceInfo: DeviceInfo = {
        token,
        platform: Platform.OS,
        os_version: Device.osVersion || undefined,
        device_model: Device.modelName || undefined,
      };

      console.log('[Notification Service] Storing device token with info:', deviceInfo);

      await createUserDevice({
        token: deviceInfo.token,
        tokenType: EXPO_PUSH_TOKEN_TYPE,
        platform: deviceInfo.platform,
        deviceModel: deviceInfo.device_model,
        osVersion: deviceInfo.os_version,
        isActive: true,
      });
    } catch (error) {
      console.error('[Notification Service] storeToken error:', error);
    }
  },

  async unregister(token: string, userId: string): Promise<void> {
    try {
      // assuming your backend supports deactivate via POST/PATCH
      await unregisterDevice(token);
    } catch (error) {
      console.error('[Notification Service] unregister error:', error);
    }
  },

  async getCurrentToken(): Promise<string | null> {
    try {
      if (!Device.isDevice) return null;

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: PROJECT_ID,
      });

      return tokenData.data || null;
    } catch (error) {
      console.error('[Notification Service] getCurrentToken error:', error);
      return null;
    }
  },

  async areNotificationsEnabled(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('[Notification Service] areNotificationsEnabled error:', error);
      return false;
    }
  },
};