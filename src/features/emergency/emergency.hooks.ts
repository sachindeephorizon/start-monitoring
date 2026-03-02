/**
 * Emergency Hooks
 * 
 * React hooks for emergency functionality.
 */

import { useState, useCallback, useEffect } from 'react';
import { EmergencyService } from './emergency.service';
import { Emergency, EmergencyPayload, EmergencyCreationResult } from './emergency.types';

/**
 * Hook for emergency operations
 * 
 * Provides methods to trigger and manage emergencies.
 */
export function useEmergency() {
  const [loading, setLoading] = useState(false);
  const [currentEmergency, setCurrentEmergency] = useState<Emergency | null>(null);

  /**
   * Trigger an emergency
   * 
   * Creates an emergency record on the server with ONE network call.
   * Location is captured automatically but is optional - emergency
   * proceeds even if location capture fails.
   * 
   * @param payload Optional emergency payload (description)
   * @returns Emergency creation result
   */
  const triggerEmergency = useCallback(
    async (payload?: EmergencyPayload): Promise<EmergencyCreationResult> => {
      setLoading(true);
      try {
        const result = await EmergencyService.trigger(payload);
        
        // If successful, refresh current emergency
        if (result.success) {
          const emergency = await EmergencyService.getCurrentEmergency();
          setCurrentEmergency(emergency);
        }
        
        return result;
      } catch (error: any) {
        console.error('[Emergency Hook] Error triggering emergency:', error);
        return {
          success: false,
          error: error.message || 'Failed to trigger emergency',
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Cancel current emergency
   * 
   * @param emergencyId Emergency ID to cancel
   * @returns Success status
   */
  const cancelEmergency = useCallback(async (emergencyId: string): Promise<boolean> => {
    setLoading(true);
    try {
      const success = await EmergencyService.cancel(emergencyId);
      if (success) {
        setCurrentEmergency(null);
      }
      return success;
    } catch (error) {
      console.error('[Emergency Hook] Error cancelling emergency:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Refresh current emergency status
   */
  const refreshEmergency = useCallback(async () => {
    try {
      const emergency = await EmergencyService.getCurrentEmergency();
      setCurrentEmergency(emergency);
    } catch (error) {
      console.error('[Emergency Hook] Error refreshing emergency:', error);
    }
  }, []);

  // Load current emergency on mount
  useEffect(() => {
    refreshEmergency();
  }, [refreshEmergency]);

  return {
    loading,
    currentEmergency,
    hasActiveEmergency: currentEmergency !== null,
    triggerEmergency,
    cancelEmergency,
    refreshEmergency,
  };
}

