/**
 * Tracking Hooks
 * 
 * React hooks for location tracking functionality.
 * These hooks provide easy access to tracking operations from React components.
 */

import { useState, useEffect, useCallback } from 'react';
import { TrackingService } from './tracking.service';
import { TrackingInterval } from './tracking.types';

/**
 * Hook for location tracking
 * 
 * Provides methods to start and stop tracking, as well as the current
 * tracking state.
 */
export function useTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check tracking status on mount
  useEffect(() => {
    let mounted = true;

    async function checkStatus() {
      try {
        const status = await TrackingService.isTracking();
        if (mounted) {
          setIsTracking(status);
        }
      } catch (error) {
        console.error('Error checking tracking status:', error);
      }
    }

    checkStatus();

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Start location tracking
   * 
   * Starts the background location task. Location updates will be
   * delivered to the background task even when the app is in the
   * background or killed.
   * 
   * NOTE: This only starts location collection. You should create
   * a tracking session in the database separately.
   */
  const startTracking = useCallback(async () => {
    try {
      setLoading(true);
      await TrackingService.start();
      setIsTracking(true);
    } catch (error) {
      console.error('Failed to start tracking:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Stop location tracking
   * 
   * Stops the background location task. Location updates will no
   * longer be received after this is called.
   * 
   * NOTE: This only stops location collection. You should end the
   * tracking session in the database separately.
   */
  const stopTracking = useCallback(async () => {
    try {
      setLoading(true);
      await TrackingService.stop();
      setIsTracking(false);
    } catch (error) {
      console.error('Failed to stop tracking:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Start tracking with a session
   * 
   * Creates a tracking session in the database and starts location collection.
   * This is the recommended way to start tracking.
   * 
   * @param intervalMinutes The tracking interval (logical, not a timer)
   * @param durationMinutes How long the session should last
   * @returns The created session ID, or null if failed
   */
  const startTrackingWithSession = useCallback(
    async (
      intervalMinutes: TrackingInterval,
      durationMinutes: number
    ): Promise<string | null> => {
      try {
        setLoading(true);

        // Create session first
        const session = await TrackingService.createSession(
          intervalMinutes,
          durationMinutes
        );

        if (!session) {
          return null;
        }

        // Then start location collection
        await TrackingService.start();
        setIsTracking(true);

        return session.id;
      } catch (error) {
        console.error('Failed to start tracking with session:', error);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Stop tracking and end session
   * 
   * Ends the tracking session in the database and stops location collection.
   * This is the recommended way to stop tracking.
   * 
   * @param sessionId The tracking session ID to end
   */
  const stopTrackingWithSession = useCallback(
    async (sessionId: string): Promise<void> => {
      try {
        setLoading(true);

        // Stop location collection
        await TrackingService.stop();
        setIsTracking(false);

        // Then end the session
        await TrackingService.endSession(sessionId);
      } catch (error) {
        console.error('Failed to stop tracking with session:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    isTracking,
    loading,
    startTracking,
    stopTracking,
    startTrackingWithSession,
    stopTrackingWithSession,
  };
}

