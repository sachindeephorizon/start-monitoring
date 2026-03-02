/**
 * Permission Types
 * 
 * Defines capabilities and permission types for the DeepHorizon app.
 * This module provides type-safe definitions for permissions and capabilities.
 * 
 * iOS SAFETY: These types represent user-facing capabilities, not OS APIs.
 * This abstraction ensures we can handle iOS/Android differences cleanly.
 */

/**
 * App-level permission types
 * 
 * These correspond to system permissions that the app needs to request.
 */
export type AppPermission =
  | 'location_when_in_use'
  | 'location_always'
  | 'notifications'
  | 'microphone'
  | 'camera';

/**
 * Permission status after request/check
 * 
 * - granted: User has granted permission
 * - denied: User denied permission (can ask again)
 * - blocked: User denied and blocked future requests (must go to settings)
 * - unavailable: Permission not available on this device/platform
 */
export type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'unavailable';

/**
 * User-facing capabilities
 * 
 * These represent features the user can interact with.
 * Each capability may require multiple permissions.
 */
export type Capability =
  | 'tracking'
  | 'emergency'
  | 'audio_call'
  | 'video_call'
  | 'check_in';

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  permission: AppPermission;
  status: PermissionStatus;
}

/**
 * Capability check result
 */
export interface CapabilityCheckResult {
  capability: Capability;
  granted: boolean;
  missingPermissions: AppPermission[];
}

