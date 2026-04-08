import { useCallback, useEffect, useState } from 'react';
import { EmergencyService } from './emergency.service';
import {
  ActiveEmergencyState,
  EmergencyAbortResult,
  EmergencyCreationResult,
  UpdateEmergencyStatusPayload,
} from './emergency.types';

export function useEmergency() {
  const [loading, setLoading] = useState(false);
  const [activeEmergency, setActiveEmergency] = useState<ActiveEmergencyState | null>(null);

  const refreshActiveEmergency = useCallback(async () => {
    const current = await EmergencyService.hydrateActiveEmergencyState();
    setActiveEmergency(current);
    return current;
  }, []);

  const triggerEmergency = useCallback(async (): Promise<EmergencyCreationResult> => {
    setLoading(true);
    try {
      const result = await EmergencyService.trigger();
      if (result.success && result.data) {
        const state: ActiveEmergencyState = {
          emergencyId: result.data.emergencyId,
          callId: result.data.callId,
          callToken: result.data.callToken,
          trackingId: result.data.trackingId,
          triggeredAtMs: Date.now(),
          abortWindowSec: 10,
        };

        await EmergencyService.saveActiveEmergency(state);
        setActiveEmergency(state);
      }

      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const abortEmergency = useCallback(async (passkey: string): Promise<EmergencyAbortResult> => {
    setLoading(true);
    try {
      const result = await EmergencyService.abort(passkey);
      if (result.success) {
        await EmergencyService.clearActiveEmergency();
        setActiveEmergency(null);
      }
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateEmergencyStatus = useCallback(
    async (emergencyId: string, payload: UpdateEmergencyStatusPayload): Promise<EmergencyAbortResult> => {
      setLoading(true);
      try {
        const result = await EmergencyService.updateStatus(emergencyId, payload);
        if (result.success) {
          await EmergencyService.clearActiveEmergency();
          setActiveEmergency(null);
        }
        return result;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void refreshActiveEmergency();
  }, [refreshActiveEmergency]);

  return {
    loading,
    activeEmergency,
    hasActiveEmergency: !!activeEmergency,
    triggerEmergency,
    abortEmergency,
    updateEmergencyStatus,
    refreshActiveEmergency,
  };
}
