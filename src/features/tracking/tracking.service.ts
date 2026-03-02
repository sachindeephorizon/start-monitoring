/**
 * Tracking Service
 * 
 * Controls starting and stopping location tracking.
 * This service is the interface between the UI and the background location task.
 * 
 * iOS SAFETY:
 * - Uses Expo Location API with TaskManager
 * - No JavaScript timers
 * - No polling
 * - System-driven updates only
 * - Server handles all timing logic
 */

import * as Location from 'expo-location';
import { LOCATION_TASK_NAME, LOCATION_CONFIG } from './tracking.constants';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { TrackingInterval } from './tracking.types';

/**
 * Tracking Service
 * 
 * Provides methods to start and stop location tracking.
 * The actual location updates are handled by the background task
 * defined in tracking.task.ts.
 */
export const TrackingService = {
  /**
   * Start location tracking
   * 
   * Registers the background location task and starts receiving location updates.
   * Location updates will be delivered to the background task even when the
   * app is in the background or killed.
   * 
   * IMPORTANT: This does NOT create a tracking session in the database.
   * The tracking session must be created separately via the API.
   * This method only starts the location collection.
   * 
   * @param options Optional configuration for location updates
   */
  async start(options?: {
    accuracy?: Location.Accuracy;
    distanceInterval?: number;
  }): Promise<void> {
    try {
      // Check if location updates are already started
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME
      );

      if (hasStarted) {
        console.log('[Tracking Service] Location updates already started');
        return;
      }

      // Ensure foreground permission exists before requesting background permission.
      const foreground = await Location.getForegroundPermissionsAsync();
      let foregroundStatus = foreground.status;
      if (foregroundStatus !== 'granted') {
        const requestedForeground = await Location.requestForegroundPermissionsAsync();
        foregroundStatus = requestedForeground.status;
      }
      if (foregroundStatus !== 'granted') {
        console.log('[Tracking Service] Foreground location permission denied - cannot start tracking');
        return;
      }

      // Request background permission if needed.
      const background = await Location.getBackgroundPermissionsAsync();
      let backgroundStatus = background.status;
      if (backgroundStatus !== 'granted') {
        const requestedBackground = await Location.requestBackgroundPermissionsAsync();
        backgroundStatus = requestedBackground.status;
      }
      if (backgroundStatus !== 'granted') {
        console.log('[Tracking Service] Background location permission not granted. Open app settings and allow "Always" location for killed/background tracking.');
      }

      // Start location updates with background task
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: options?.accuracy || Location.Accuracy.High,
        distanceInterval: options?.distanceInterval || LOCATION_CONFIG.distanceInterval,
        pausesUpdatesAutomatically: LOCATION_CONFIG.pausesUpdatesAutomatically,
        showsBackgroundLocationIndicator: LOCATION_CONFIG.showsBackgroundLocationIndicator,
        activityType: Location.ActivityType.Other,
        
        // iOS-specific options
        foregroundService: {
          notificationTitle: 'Location Tracking Active',
          notificationBody: 'DeepHorizon is tracking your location for safety',
          notificationColor: '#000000',
        },
      });

      console.log('[Tracking Service] Location tracking started (background permission:', backgroundStatus, ')');
    } catch (error) {
      // Don't throw error - tracking can work without background location
      console.log('[Tracking Service] Background location tracking not available - tracking will use foreground location only:', error);
    }
  },

  /**
   * Stop location tracking
   * 
   * Stops the background location task. Location updates will no longer
   * be received after this is called.
   * 
   * IMPORTANT: This does NOT end the tracking session in the database.
   * The tracking session must be ended separately via the API.
   * This method only stops location collection.
   */
  async stop(): Promise<void> {
    try {
      // Check if location updates are currently running
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME
      );

      if (!hasStarted) {
        console.log('[Tracking Service] Location updates not running');
        return;
      }

      // Stop location updates
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);

      console.log('[Tracking Service] Location tracking stopped');
    } catch (error) {
      console.error('[Tracking Service] Failed to stop tracking:', error);
      throw error;
    }
  },

  /**
   * Check if tracking is currently active
   * 
   * @returns true if location updates are running, false otherwise
   */
  async isTracking(): Promise<boolean> {
    try {
      return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch (error) {
      console.error('[Tracking Service] Failed to check tracking status:', error);
      return false;
    }
  },

  /**
   * Create a tracking session in the database
   * 
   * This creates the server-side tracking session record.
   * Location updates should only be sent when a session exists.
   * 
   * @param intervalMinutes The tracking interval (logical, not a timer)
   * @param durationMinutes How long the session should last
   * @returns The created tracking session
   */
  async createSession(
    intervalMinutes: TrackingInterval,
    durationMinutes: number
  ): Promise<{ id: string } | null> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        throw new Error('Not authenticated');
      }

      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

      const { data, error } = await supabase
        .from('tracking_sessions')
        .insert({
          mobile_user_id: user.id,
          session_name: 'Track Me on the Go', // Default session name as per schema
          status: 'active',
          checkin_interval_minutes: intervalMinutes,
          use_account_passkey: true, // Default to using account passkey
          start_time: startedAt.toISOString(),
          end_time: expiresAt.toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        console.error('[Tracking Service] Failed to create session:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[Tracking Service] Error creating session:', error);
      return null;
    }
  },

  /**
   * End a tracking session in the database
   * 
   * This marks the session as completed or ended.
   * 
   * @param sessionId The tracking session ID to end
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('tracking_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (error) {
        console.error('[Tracking Service] Failed to end session:', error);
        throw error;
      }
    } catch (error) {
      console.error('[Tracking Service] Error ending session:', error);
      throw error;
    }
  },
};
