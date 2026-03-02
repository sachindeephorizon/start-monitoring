/**
 * Settings Types
 * 
 * Type definitions for settings and preferences functionality.
 * 
 * iOS SAFETY: Settings screens are read-only or user-control only.
 * No background logic, no automatic permission re-requests.
 */

/**
 * Permission status for display
 */
export type PermissionDisplayStatus =
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'limited'
  | 'unavailable'
  | 'not_determined';

/**
 * Permission status entry
 */
export interface PermissionStatusEntry {
  /**
   * Permission identifier
   */
  permission: string;

  /**
   * Display name
   */
  displayName: string;

  /**
   * Current status
   */
  status: PermissionDisplayStatus;

  /**
   * Whether permission can be opened in iOS Settings
   */
  canOpenSettings: boolean;

  /**
   * Explanation of why permission is required
   */
  explanation: string;
}

/**
 * Notification preference
 */
export interface NotificationPreference {
  type: 'emergency' | 'check_in' | 'chat' | 'booking' | 'call';
  enabled: boolean;
  label: string;
  description: string;
  required?: boolean; // Cannot be disabled (e.g., emergency alerts)
}

/**
 * App information
 */
export interface AppInfo {
  name: string;
  version: string;
  buildNumber: string;
  bundleIdentifier: string;
}

/**
 * Account deletion result
 */
export interface AccountDeletionResult {
  success: boolean;
  error?: string;
}

