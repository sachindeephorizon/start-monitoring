/**
 * Check-In Hooks
 * 
 * React hooks for check-in functionality.
 */

import { useState, useCallback, useEffect } from 'react';
import { CheckInService } from './checkin.service';
import {
  CheckIn,
  CheckInPayload,
  CheckInSchedulingResult,
  CheckInCompletionResult,
  CheckInStatus,
} from './checkin.types';

/**
 * Hook for check-in operations
 * 
 * Provides methods to schedule, complete, and manage check-ins.
 */
export function useCheckIns() {
  const [loading, setLoading] = useState(false);
  const [pendingCheckIn, setPendingCheckIn] = useState<CheckIn | null>(null);

  /**
   * Schedule a check-in
   * 
   * Creates a check-in record with the scheduled time.
   * The server handles push notifications and escalation.
   * 
   * @param payload Check-in payload (scheduled_at, message, frequency)
   * @returns Check-in scheduling result
   */
  const scheduleCheckIn = useCallback(
    async (payload: CheckInPayload): Promise<CheckInSchedulingResult> => {
      setLoading(true);
      try {
        const result = await CheckInService.schedule(payload);
        return result;
      } catch (error: any) {
        console.error('[Check-In Hook] Error scheduling check-in:', error);
        return {
          success: false,
          error: error.message || 'Failed to schedule check-in',
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Complete a check-in
   * 
   * Marks a check-in as completed. Should be called after passkey verification.
   * 
   * @param checkInId Check-in ID to complete
   * @param captureLocation Whether to capture current location
   * @returns Check-in completion result
   */
  const completeCheckIn = useCallback(
    async (
      checkInId: string,
      captureLocation: boolean = false
    ): Promise<CheckInCompletionResult> => {
      setLoading(true);
      try {
        const result = await CheckInService.complete(checkInId, captureLocation);
        
        // If successful, refresh pending check-in
        if (result.success) {
          const checkIn = await CheckInService.getPendingCheckIn();
          setPendingCheckIn(checkIn);
        }
        
        return result;
      } catch (error: any) {
        console.error('[Check-In Hook] Error completing check-in:', error);
        return {
          success: false,
          error: error.message || 'Failed to complete check-in',
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Cancel a check-in
   * 
   * @param checkInId Check-in ID to cancel
   * @returns Success status
   */
  const cancelCheckIn = useCallback(async (checkInId: string): Promise<boolean> => {
    setLoading(true);
    try {
      const success = await CheckInService.cancel(checkInId);
      if (success) {
        // Refresh pending check-in
        const checkIn = await CheckInService.getPendingCheckIn();
        setPendingCheckIn(checkIn);
      }
      return success;
    } catch (error) {
      console.error('[Check-In Hook] Error cancelling check-in:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get check-in by ID
   * 
   * @param checkInId Check-in ID
   * @returns Check-in record, or null
   */
  const getCheckIn = useCallback(async (checkInId: string): Promise<CheckIn | null> => {
    try {
      return await CheckInService.getCheckIn(checkInId);
    } catch (error) {
      console.error('[Check-In Hook] Error getting check-in:', error);
      return null;
    }
  }, []);

  /**
   * Get all check-ins
   * 
   * @param status Optional status filter
   * @returns Array of check-ins
   */
  const getAllCheckIns = useCallback(
    async (status?: CheckInStatus): Promise<CheckIn[]> => {
      try {
        return await CheckInService.getAllCheckIns(status);
      } catch (error) {
        console.error('[Check-In Hook] Error getting check-ins:', error);
        return [];
      }
    },
    []
  );

  /**
   * Refresh pending check-in
   */
  const refreshPendingCheckIn = useCallback(async () => {
    try {
      const checkIn = await CheckInService.getPendingCheckIn();
      setPendingCheckIn(checkIn);
    } catch (error) {
      console.error('[Check-In Hook] Error refreshing pending check-in:', error);
    }
  }, []);

  // Load pending check-in on mount
  useEffect(() => {
    refreshPendingCheckIn();
  }, [refreshPendingCheckIn]);

  return {
    loading,
    pendingCheckIn,
    hasPendingCheckIn: pendingCheckIn !== null,
    scheduleCheckIn,
    completeCheckIn,
    cancelCheckIn,
    getCheckIn,
    getAllCheckIns,
    refreshPendingCheckIn,
  };
}

