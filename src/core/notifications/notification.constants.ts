/**
 * Notification Constants
 * 
 * Constants for push notification configuration.
 */

/**
 * Notification channels for Android
 * 
 * Android uses channels to group notifications and allow users
 * to control notification behavior per channel.
 * 
 * iOS ignores channels but uses notification categories instead.
 */
export const NOTIFICATION_CHANNELS = {
  /**
   * Emergency notifications - highest priority, always shown
   */
  emergency: 'emergency',

  /**
   * Incoming call notifications - high priority, immediate
   */
  calls: 'calls',

  /**
   * Check-in notifications - normal priority
   */
  check_ins: 'check_ins',

  /**
   * Chat notifications - normal priority
   */
  chat: 'chat',

  /**
   * General notifications - normal priority
   */
  general: 'general',
} as const;

/**
 * Notification channel names (display names)
 */
export const NOTIFICATION_CHANNEL_NAMES: Record<string, string> = {
  emergency: 'Emergency Alerts',
  calls: 'Incoming Calls',
  check_ins: 'Check-In Reminders',
  chat: 'Chat Messages',
  general: 'General Notifications',
};

/**
 * Notification channel descriptions
 */
export const NOTIFICATION_CHANNEL_DESCRIPTIONS: Record<string, string> = {
  emergency: 'Critical emergency alerts and safety notifications',
  calls: 'Notifications for incoming video and audio calls',
  check_ins: 'Reminders for scheduled check-ins',
  chat: 'New messages from security agents',
  general: 'General app notifications and updates',
};

/**
 * Notification sound names
 */
export const NOTIFICATION_SOUNDS = {
  default: 'default',
  siren: 'siren', // Custom siren sound for emergencies
  none: 'none',
} as const;

/**
 * Expo push token type
 */
export const EXPO_PUSH_TOKEN_TYPE = 'expo' as const;

