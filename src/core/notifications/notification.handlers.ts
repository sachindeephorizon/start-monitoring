/**
 * Notification Handlers
 * 
 * Configures how notifications are handled when received in foreground,
 * background, and when the app is killed.
 * 
 * iOS SAFETY: This sets up notification behavior for all app states.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_NAMES,
  NOTIFICATION_CHANNEL_DESCRIPTIONS,
} from './notification.constants';

/**
 * Setup notification handlers
 * 
 * Configures how notifications are displayed and handled based on app state.
 * This must be called early in the app lifecycle (in App.tsx).
 * 
 * iOS SAFETY: This handler determines notification behavior when app is:
 * - Foreground: Shows notification in-app
 * - Background: Shows notification in notification center
 * - Killed: Shows notification, tapping it will cold-start the app
 */
export function setupNotificationHandlers(): void {
  // Set notification handler for when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as any;
      const notificationType = data?.type;

      const behavior = (options: { shouldPlaySound: boolean }) => ({
        shouldShowAlert: true,
        shouldPlaySound: options.shouldPlaySound,
        shouldSetBadge: true,
        // expo-notifications newer API requires these as well
        shouldShowBanner: true,
        shouldShowList: true,
      });

      // Emergency notifications should always show alert and play sound
      if (notificationType === 'emergency') {
        return behavior({ shouldPlaySound: true });
      }

      // Incoming call notifications should always show alert and play sound
      if (notificationType === 'incoming_call') {
        return behavior({ shouldPlaySound: true });
      }

      // Check-in notifications should show alert and play sound
      if (notificationType === 'check_in') {
        return behavior({ shouldPlaySound: true });
      }

      // Chat notifications should show alert
      if (notificationType === 'chat') {
        return behavior({ shouldPlaySound: false }); // Chat notifications don't need sound by default
      }

      // Default behavior for all other notifications
      return behavior({ shouldPlaySound: true });
    },
  });
}

/**
 * Setup notification channels (Android only)
 * 
 * Android requires notification channels for organizing and controlling notifications.
 * iOS ignores channels but this function is safe to call on iOS.
 * 
 * This should be called early in the app lifecycle, ideally before registering for tokens.
 */
export async function setupNotificationChannels(): Promise<void> {
  // Android only - iOS ignores channels
  if (Platform.OS !== 'android') {
    return;
  }

  // Create notification channels for Android
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.emergency, {
    name: NOTIFICATION_CHANNEL_NAMES.emergency,
    description: NOTIFICATION_CHANNEL_DESCRIPTIONS.emergency,
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF0000',
    sound: 'siren.mp3', // Use custom siren sound for emergencies
  });

  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.calls, {
    name: NOTIFICATION_CHANNEL_NAMES.calls,
    description: NOTIFICATION_CHANNEL_DESCRIPTIONS.calls,
    // Calls should be heads-up and immediate.
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 500, 500, 500],
    sound: 'default',
    enableVibrate: true,
    enableLights: true,
    lightColor: '#00D4FF',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.check_ins, {
    name: NOTIFICATION_CHANNEL_NAMES.check_ins,
    description: NOTIFICATION_CHANNEL_DESCRIPTIONS.check_ins,
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.chat, {
    name: NOTIFICATION_CHANNEL_NAMES.chat,
    description: NOTIFICATION_CHANNEL_DESCRIPTIONS.chat,
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.general, {
    name: NOTIFICATION_CHANNEL_NAMES.general,
    description: NOTIFICATION_CHANNEL_DESCRIPTIONS.general,
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

