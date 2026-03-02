/**
 * Permission Constants
 * 
 * Maps user-facing capabilities to their required permissions.
 * This is critical for self-disabling UI components when permissions
 * are not available.
 * 
 * iOS SAFETY: This mapping ensures features gracefully degrade when
 * permissions are missing, preventing silent failures.
 */

import { Capability, AppPermission } from './permission.types';

/**
 * Maps capabilities to their required permissions
 * 
 * When a capability is requested, all listed permissions must be granted
 * for that capability to function.
 */
export const CAPABILITY_REQUIREMENTS: Record<Capability, AppPermission[]> = {
  /**
   * Location tracking requires:
   * - Always location (for background tracking)
   * - Notifications (for tracking updates and alerts)
   */
  tracking: ['location_always', 'notifications'],

  /**
   * Emergency feature requires:
   * - When in use location (to capture emergency location)
   * - Notifications (for emergency alerts and agent responses)
   */
  emergency: ['location_when_in_use', 'notifications'],

  /**
   * Check-in feature requires:
   * - Notifications (for check-in reminders and completion)
   */
  check_in: ['notifications'],

  /**
   * Audio call requires:
   * - Microphone (to speak during calls)
   */
  audio_call: ['microphone'],

  /**
   * Video call requires:
   * - Camera (to show video feed)
   * - Microphone (to speak during calls)
   */
  video_call: ['camera', 'microphone'],
};

/**
 * Permission display names (for user-facing messages)
 */
export const PERMISSION_DISPLAY_NAMES: Record<AppPermission, string> = {
  location_when_in_use: 'Location (When In Use)',
  location_always: 'Location (Always)',
  notifications: 'Notifications',
  microphone: 'Microphone',
  camera: 'Camera',
};

/**
 * Capability display names (for user-facing messages)
 */
export const CAPABILITY_DISPLAY_NAMES: Record<Capability, string> = {
  tracking: 'Location Tracking',
  emergency: 'Emergency Services',
  audio_call: 'Audio Calls',
  video_call: 'Video Calls',
  check_in: 'Check-Ins',
};

