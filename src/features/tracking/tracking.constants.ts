/**
 * Tracking Constants
 * 
 * Constants used for location tracking functionality.
 */

/**
 * Location task name for Expo TaskManager
 * 
 * This name is used to register and manage the background location
 * tracking task. It must match the name used in TaskManager.defineTask()
 * and Location.startLocationUpdatesAsync().
 * 
 * iOS SAFETY: This task runs in the background, without UI, without
 * React, and without JavaScript timers. It's called by iOS when location
 * updates are available.
 */
export const LOCATION_TASK_NAME = 'deephorizon-location-task';

/**
 * Default location update settings
 */
export const LOCATION_CONFIG = {
  /**
   * Accuracy level for location updates
   * High accuracy is required for safety tracking
   */
  accuracy: 'high' as const,

  /**
   * Distance interval in meters
   * iOS will wake the app when user moves this distance
   * This is iOS-approved and doesn't use JS timers
   */
  distanceInterval: 25, // meters

  /**
   * Whether to pause updates automatically
   * Set to false for continuous tracking
   */
  pausesUpdatesAutomatically: false,

  /**
   * Show background location indicator (iOS)
   * Important for user awareness and App Store compliance
   */
  showsBackgroundLocationIndicator: true,

  /**
   * Activity type for location updates
   * Other is appropriate for general location tracking
   */
  activityType: 'other' as const,
} as const;

