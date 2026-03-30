/**
 * Notification Types
 * 
 * Type definitions for push notifications.
 * 
 * iOS SAFETY: Push notifications are the ONLY way to wake an iOS app.
 * All background communication must go through push notifications.
 */

/**
 * Notification types/categories
 * 
 * These types determine how notifications are handled and routed.
 */
export type NotificationType =
  | 'emergency'
  | 'check_in'
  | 'chat'
  | 'incoming_call'
  | 'tracking_checkin'
  | 'tracking_alert'
  | 'general';

/**
 * Push notification payload
 * 
 * The structured payload sent by the backend.
 * This must be included in every push notification for proper routing.
 */
export interface PushPayload {
  /**
   * Notification type - determines routing and handling
   */
  type: NotificationType;

  /**
   * Entity ID for the notification (e.g., emergency ID, check-in ID)
   */
  entity_id?: string;

  /**
   * Call session ID for incoming calls
   */
  call_id?: string;

  /**
   * Chat request ID for chat notifications
   */
  chat_id?: string;

  /**
   * Chat thread ID for directly opening a specific thread
   */
  thread_id?: string;

  /**
   * Tracking session ID for tracking alerts
   */
  tracking_session_id?: string;

  /**
   * Additional data for the notification
   */
  data?: Record<string, any>;

  /**
   * Title of the notification
   */
  title?: string;

  /**
   * Body/text of the notification
   */
  body?: string;

  /**
   * Sound to play (iOS/Android)
   */
  sound?: 'default' | 'siren' | 'siren.mp3' | 'none';

  /**
   * Priority level
   */
  priority?: 'high' | 'normal';
}

/**
 * Notification channel (Android)
 * 
 * Android uses channels to group and control notifications.
 */
export type NotificationChannel =
  | 'emergency'
  | 'calls'
  | 'check_ins'
  | 'chat'
  | 'general';

/**
 * Notification response (when user taps notification)
 */
export interface NotificationResponse {
  notification: {
    request: {
      content: {
        data: PushPayload;
        title?: string;
        body?: string;
      };
    };
  };
}

