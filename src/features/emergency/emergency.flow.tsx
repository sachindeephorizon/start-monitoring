import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/core/auth';
import { useEmergency } from './emergency.hooks';
import { EMERGENCY_PASSKEY_TIMEOUT_SECONDS } from './emergency.constants';
import { trackMeLocationSyncService } from '@/services/trackMeLocationSync.service';
import { streamVideoClientService } from '@/features/video/video.client';
import { navigate } from '@/navigation/navigationRef';
import { EmergencyService } from './emergency.service';

interface AbortPasskeyResult {
  success: boolean;
  error?: string;
  continuedToCall?: boolean;
}

interface EmergencyFlowContextValue {
  isEmergencyActive: boolean;
  showEmergencyPasskey: boolean;
  emergencyPasskey: string;
  emergencyCountdown: number;
  emergencyDeadline: number | null;
  isEmergencyProcessing: boolean;
  activeEmergencyId: string | null;
  setEmergencyPasskey: (value: string) => void;
  beginEmergency: () => Promise<{ success: boolean; error?: string }>;
  submitAbortPasskey: () => Promise<AbortPasskeyResult>;
  startEmergencyCallFromState: (emergencyId?: string) => Promise<boolean>;
  disableEmergencyById: (emergencyId: string, passkey: string) => Promise<AbortPasskeyResult>;
  clearEmergencyUi: () => void;
}

const EmergencyFlowContext = createContext<EmergencyFlowContextValue | null>(null);

export const EmergencyFlowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const { triggerEmergency, abortEmergency, activeEmergency, refreshActiveEmergency } = useEmergency();

  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const [showEmergencyPasskey, setShowEmergencyPasskey] = useState(false);
  const [emergencyPasskey, setEmergencyPasskey] = useState('');
  const [emergencyCountdown, setEmergencyCountdown] = useState(EMERGENCY_PASSKEY_TIMEOUT_SECONDS);
  const [emergencyDeadline, setEmergencyDeadline] = useState<number | null>(null);
  const [isEmergencyProcessing, setIsEmergencyProcessing] = useState(false);

  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const emergencyCallStartedRef = useRef(false);
  const emergencyTriggerInFlightRef = useRef(false);
  const emergencyProcessingRef = useRef(false);

  const clearEmergencyUi = useCallback(() => {
    setIsEmergencyActive(false);
    setShowEmergencyPasskey(false);
    setEmergencyPasskey('');
    setEmergencyDeadline(null);
    setEmergencyCountdown(EMERGENCY_PASSKEY_TIMEOUT_SECONDS);
  }, []);

  const startEmergencyCallFromState = useCallback(async (emergencyId?: string): Promise<boolean> => {
    // Prevent double-taps, but do not permanently lock future attempts.
    if (emergencyCallStartedRef.current) {
      return false;
    }

    let context = activeEmergency;

    // If caller requested a specific emergency id, ensure we use matching context.
    if (emergencyId && context?.emergencyId && context.emergencyId !== emergencyId) {
      context = null;
    }

    if (!context && emergencyId) {
      const byId = await EmergencyService.fetchEmergencyContextById(emergencyId);
      if (byId?.status === 'ACTIVE' && byId.callId && byId.callToken && byId.trackingId) {
        context = {
          emergencyId: byId.emergencyId,
          callId: byId.callId,
          callToken: byId.callToken,
          trackingId: byId.trackingId,
          triggeredAtMs: Date.parse(byId.triggeredAt) || Date.now(),
          abortWindowSec: byId.triggerWindowSec || EMERGENCY_PASSKEY_TIMEOUT_SECONDS,
        };
      }
    }

    if (!context) {
      context = await EmergencyService.hydrateActiveEmergencyState();
    }

    if (!context) {
      return false;
    }

    emergencyCallStartedRef.current = true;
    clearEmergencyUi();

    navigate('Main' as any, {
      screen: 'VideoMonitor',
      params: {
        callId: context.callId,
        callToken: context.callToken,
        userName: auth.user?.name || auth.user?.email || 'User',
        autoStart: false,
      },
    });

    // Release lock shortly after navigation to allow retries if user comes back.
    setTimeout(() => {
      emergencyCallStartedRef.current = false;
    }, 1500);

    return true;
  }, [activeEmergency, auth.user?.email, auth.user?.name, clearEmergencyUi]);

  const beginEmergency = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (emergencyTriggerInFlightRef.current || isEmergencyActive || isEmergencyProcessing) {
      return { success: false, error: 'Emergency is already in progress.' };
    }

    if (!auth.isAuthReady) {
      return { success: false, error: 'App is still initializing. Please try again in a moment.' };
    }

    emergencyTriggerInFlightRef.current = true;
    setIsEmergencyProcessing(true);

    try {
      const result = await triggerEmergency();
      if (!mountedRef.current) {
        return { success: false, error: 'Screen is no longer active.' };
      }

      if (!result.success || !result.data) {
        return { success: false, error: result.error || 'Failed to trigger emergency.' };
      }

      const deadlineMs = Date.now() + EMERGENCY_PASSKEY_TIMEOUT_SECONDS * 1000;

      streamVideoClientService.setNextTokenOverride(result.data.callToken);
      if (auth.user?.id) {
        void streamVideoClientService.preFetchToken(auth.user.id, auth.user?.name || auth.user?.email || 'User');
      }

      const locationStarted = await trackMeLocationSyncService.start(result.data.trackingId);
      if (!locationStarted) {
        console.warn('[EmergencyFlow] Emergency location sync not started (permission unavailable).');
      }

      emergencyCallStartedRef.current = false;
      setIsEmergencyActive(true);
      setShowEmergencyPasskey(true);
      setEmergencyPasskey('');
      setEmergencyCountdown(EMERGENCY_PASSKEY_TIMEOUT_SECONDS);
      setEmergencyDeadline(deadlineMs);
      void refreshActiveEmergency();

      return { success: true };
    } finally {
      setIsEmergencyProcessing(false);
      emergencyTriggerInFlightRef.current = false;
    }
  }, [
    isEmergencyActive,
    isEmergencyProcessing,
    auth.isAuthReady,
    auth.user?.email,
    auth.user?.id,
    auth.user?.name,
    refreshActiveEmergency,
    triggerEmergency,
  ]);

  const submitAbortPasskey = useCallback(async (): Promise<AbortPasskeyResult> => {
    if (emergencyProcessingRef.current) {
      return { success: false, error: 'Emergency verification is already in progress.' };
    }

    emergencyProcessingRef.current = true;
    setIsEmergencyProcessing(true);

    try {
      const passkey = emergencyPasskey.trim();
      const result = await abortEmergency(passkey);

      if (!mountedRef.current) {
        return { success: false, error: 'Screen is no longer active.' };
      }

      if (result.success) {
        clearEmergencyUi();
        emergencyCallStartedRef.current = false;
        await trackMeLocationSyncService.stop();
        return { success: true };
      }

      await startEmergencyCallFromState();
      return {
        success: false,
        error: result.error || 'Unable to cancel emergency. Continuing emergency flow now.',
        continuedToCall: true,
      };
    } catch (error: any) {
      await startEmergencyCallFromState();
      return {
        success: false,
        error: error?.message || 'Unable to verify abort request. Continuing emergency flow now.',
        continuedToCall: true,
      };
    } finally {
      setIsEmergencyProcessing(false);
      emergencyProcessingRef.current = false;
    }
  }, [abortEmergency, clearEmergencyUi, emergencyPasskey, startEmergencyCallFromState]);

  const disableEmergencyById = useCallback(
    async (emergencyId: string, passkey: string): Promise<AbortPasskeyResult> => {
      setIsEmergencyProcessing(true);
      try {
        const result = await EmergencyService.disable(emergencyId, passkey);
        if (result.success) {
          await EmergencyService.clearActiveEmergency();
          clearEmergencyUi();
          emergencyCallStartedRef.current = false;
          await trackMeLocationSyncService.stop();
          return { success: true };
        }

        return {
          success: false,
          error: result.error || 'Unable to disable emergency.',
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || 'Unable to disable emergency.',
        };
      } finally {
        setIsEmergencyProcessing(false);
      }
    },
    [clearEmergencyUi],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!activeEmergency || emergencyCallStartedRef.current) {
      return;
    }

    const windowMs = (activeEmergency.abortWindowSec || EMERGENCY_PASSKEY_TIMEOUT_SECONDS) * 1000;
    const deadlineMs = activeEmergency.triggeredAtMs + windowMs;
    const stillWithinWindow = Date.now() < deadlineMs;

    if (!stillWithinWindow) {
      clearEmergencyUi();
      return;
    }

    setIsEmergencyActive(true);
    setShowEmergencyPasskey(true);
    setEmergencyDeadline(deadlineMs);
    setEmergencyPasskey('');
  }, [activeEmergency, clearEmergencyUi]);

  useEffect(() => {
    // Safety net: never keep sending emergency location points once
    // emergency state is no longer active in shared state.
    if (activeEmergency) {
      return;
    }

    emergencyCallStartedRef.current = false;
    void trackMeLocationSyncService.stop();
  }, [activeEmergency]);

  useEffect(() => {
    if (!isEmergencyActive || !emergencyDeadline) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((emergencyDeadline - Date.now()) / 1000));
      setEmergencyCountdown(remaining);

      if (remaining <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        void startEmergencyCallFromState();
      }
    };

    updateCountdown();
    countdownIntervalRef.current = setInterval(updateCountdown, 100);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [isEmergencyActive, emergencyDeadline, startEmergencyCallFromState]);

  const value = useMemo<EmergencyFlowContextValue>(
    () => ({
      isEmergencyActive,
      showEmergencyPasskey,
      emergencyPasskey,
      emergencyCountdown,
      emergencyDeadline,
      isEmergencyProcessing,
      activeEmergencyId: activeEmergency?.emergencyId || null,
      setEmergencyPasskey,
      beginEmergency,
      submitAbortPasskey,
      startEmergencyCallFromState,
      disableEmergencyById,
      clearEmergencyUi,
    }),
    [
      isEmergencyActive,
      showEmergencyPasskey,
      emergencyPasskey,
      emergencyCountdown,
      emergencyDeadline,
      isEmergencyProcessing,
      activeEmergency?.emergencyId,
      beginEmergency,
      submitAbortPasskey,
      startEmergencyCallFromState,
      disableEmergencyById,
      clearEmergencyUi,
    ],
  );

  return <EmergencyFlowContext.Provider value={value}>{children}</EmergencyFlowContext.Provider>;
};

export const useEmergencyFlow = (): EmergencyFlowContextValue => {
  const context = useContext(EmergencyFlowContext);
  if (!context) {
    throw new Error('useEmergencyFlow must be used within EmergencyFlowProvider');
  }
  return context;
};
