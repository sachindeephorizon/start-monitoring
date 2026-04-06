import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { EXPO_PUSH_TOKEN_TYPE } from './notification.constants';
import { createUserDevice, unregisterDevice } from '@/api/notifications';
import { AuthSession } from '@/core/auth';


export const PROJECT_ID = '27fb532d-c0f0-45e5-919e-0e7b9a62366d';


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
    } catch (error) {
      console.error('[Notification Service] register error:', error);
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