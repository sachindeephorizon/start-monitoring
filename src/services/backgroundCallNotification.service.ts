/**
 * Background call notification service
 *
 * Purpose:
 * - Provide an "ongoing call" notification so users can return to the app while a call is active.
 * - Ensure Android uses a high-importance channel with sound/vibration for call-related notifications.
 *
 * Notes:
 * - Incoming call *ringing* is delivered via push notifications (handled by `expo-notifications`).
 * - This service is primarily for an "in-call" persistent notification while the call is active.
 */

import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  type AndroidChannel,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import { NOTIFICATION_CHANNELS, NOTIFICATION_CHANNEL_DESCRIPTIONS, NOTIFICATION_CHANNEL_NAMES } from '@/core/notifications/notification.constants';

class BackgroundCallNotificationService {
  private initialized = false;

  private notificationIdForCall(callId: string) {
    return `active-call-${callId}`;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      if (Platform.OS === 'android') {
        const channel: AndroidChannel = {
          id: NOTIFICATION_CHANNELS.calls,
          name: NOTIFICATION_CHANNEL_NAMES.calls,
          description: NOTIFICATION_CHANNEL_DESCRIPTIONS.calls,
          importance: AndroidImportance.HIGH,
          sound: 'default',
          vibration: true,
          visibility: AndroidVisibility.PUBLIC,
        };

        await notifee.createChannel(channel);
      }

      this.initialized = true;
    } catch (error) {
      // Non-fatal: call can still proceed, we just may not show an ongoing notification.
      console.warn('[BackgroundCallNotification] Failed to initialize notification channel:', error);
    }
  }

  async showCallNotification(callId: string, userName: string, isVideo: boolean): Promise<void> {
    await this.ensureInitialized();

    try {
      const notificationId = this.notificationIdForCall(callId);
      const callLabel = isVideo ? 'Video call' : 'Audio call';

      await notifee.displayNotification({
        id: notificationId,
        title: `${callLabel} in progress`,
        body: `Tap to return to your call`,
        data: {
          type: 'active_call',
          call_id: callId,
          call_type: isVideo ? 'video' : 'audio',
          user_name: userName,
        },
        android: Platform.OS === 'android'
          ? {
              channelId: NOTIFICATION_CHANNELS.calls,
              category: AndroidCategory.CALL,
              importance: AndroidImportance.HIGH,
              smallIcon: 'notification_icon',
              ongoing: true,
              autoCancel: false,
              showTimestamp: true,
              pressAction: { id: 'default' },
            }
          : undefined,
        ios: Platform.OS === 'ios'
          ? {
              // For iOS, this shows in Notification Center if the app backgrounds during the call.
              // Sound is controlled by system rules; we keep this as a silent "ongoing" entry.
              // If you want sound here, use push for "incoming_call" instead.
              sound: undefined,
              interruptionLevel: 'active',
            }
          : undefined,
      });
    } catch (error) {
      console.warn('[BackgroundCallNotification] Failed to show call notification:', error);
    }
  }

  async dismissCallNotification(callId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      await notifee.cancelNotification(this.notificationIdForCall(callId));
    } catch (error) {
      console.warn('[BackgroundCallNotification] Failed to dismiss call notification:', error);
    }
  }
}

export const backgroundCallNotificationService = new BackgroundCallNotificationService();

