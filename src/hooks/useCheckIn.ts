/**
 * Check-In Hook
 * 
 * Comprehensive hook for managing scheduled check-ins.
 * Based on old app's useDatabaseCheckIn but adapted for new architecture.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import { Alert } from 'react-native';
import { CheckInTime, CheckInFrequency } from '@/types/checkin';
import { CheckInService } from '@/features/checkins/checkin.service';
import { CheckIn } from '@/features/checkins/checkin.types';
import { verifyEmergencyPasskey } from '@/features/emergency/emergency.passkey';
import { formatFullDateLabel, parseFullDateLabel } from '@/utils/dateFormat';
import { calculateNextRecurrence } from '@/utils/recurring';
import { dedupe, getSessionUser } from '@/core/net/supabaseQuery';
import { QueryCache } from '@/core/net/queryCache';
import { useAuth } from '@/core/auth';

// Helper to format date as "Friday, July 18, 2025"
const formatDateString = (date: Date): string => {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayName = dayNames[date.getDay()];
  const month = monthNames[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `${dayName}, ${month} ${day}, ${year}`;
};

// Parse date/time to ISO string
const parseDateTime = (time: CheckInTime, date: string): Date | null => {
  try {
    if (!date || !time) {
      return null;
    }

    const parsedDate = parseFullDateLabel(date);
    if (isNaN(parsedDate.getTime())) {
      return null;
    }

    let hours = time.hours;
    if (time.period === 'PM' && hours !== 12) hours += 12;
    if (time.period === 'AM' && hours === 12) hours = 0;

    const scheduledDate = new Date(parsedDate);
    scheduledDate.setHours(hours, time.minutes, 0, 0);

    return scheduledDate;
  } catch (error) {
    console.error('Error parsing date/time:', error);
    return null;
  }
};

// Format time display
const formatTime = (time: CheckInTime): string => {
  const hours = time.hours === 0 ? 12 : time.hours > 12 ? time.hours - 12 : time.hours;
  const minutes = time.minutes.toString().padStart(2, '0');
  return `${hours}:${minutes} ${time.period}`;
};

export interface UseCheckInReturn {
  // Form state
  checkInTime: CheckInTime;
  setCheckInTime: (time: CheckInTime) => void;
  checkInDate: string;
  setCheckInDate: (date: string) => void;
  checkInFrequency: CheckInFrequency;
  setCheckInFrequency: (frequency: CheckInFrequency) => void;
  checkInNotes: string;
  setCheckInNotes: (notes: string) => void;

  // Check-in management
  scheduledCheckIns: CheckIn[];
  isScheduling: boolean;
  scheduleCheckIn: () => Promise<boolean>;
  cancelCheckIn: (id: string) => Promise<boolean>;
  loadCheckIns: () => Promise<void>;

  // Passkey modal state
  showPasskeyModal: boolean;
  setShowPasskeyModal: (show: boolean) => void;
  enteredPasskey: string;
  setEnteredPasskey: (passkey: string) => void;
  isPasskeyProcessing: boolean;
  activeCheckIn: CheckIn | null;
  passkeyCountdown: number;

  // Functions
  handlePasskeySubmit: () => Promise<void>;
  validatePasskey: (input: string) => Promise<boolean>;
}

export function useCheckIn(): UseCheckInReturn {
  const { isAuthReady } = useAuth();

  // Form state
  const [checkInTime, setCheckInTime] = useState<CheckInTime>({
    hours: 12,
    minutes: 0,
    period: 'PM'
  });
  const [checkInDate, setCheckInDate] = useState<string>(() => formatDateString(new Date()));
  const [checkInFrequency, setCheckInFrequency] = useState<CheckInFrequency>('One-time');
  const [checkInNotes, setCheckInNotes] = useState<string>('');

  // Check-in management
  const [scheduledCheckIns, setScheduledCheckIns] = useState<CheckIn[]>([]);
  const [isScheduling, setIsScheduling] = useState(false);

  // Passkey modal state
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [enteredPasskey, setEnteredPasskey] = useState('');
  const [isPasskeyProcessing, setIsPasskeyProcessing] = useState(false);
  const [activeCheckIn, setActiveCheckIn] = useState<CheckIn | null>(null);
  const [passkeyCountdown, setPasskeyCountdown] = useState(30);

  const mountedRef = useRef(true);
  const passkeyTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Ref so the 30s interval reads latest check-ins without restarting the effect
  const scheduledCheckInsRef = useRef(scheduledCheckIns);
  scheduledCheckInsRef.current = scheduledCheckIns;
  // Guard: only run the initial due-check once after first load
  const hasCheckedAfterLoadRef = useRef(false);
  // Dedup: track check-in IDs that have already had the passkey modal shown
  // Prevents re-triggering for the same check-in (e.g. completed via CheckInScreen,
  // but stale cache still shows 'pending' when modal reopens)
  const presentedCheckInIdsRef = useRef<Set<string>>(new Set());
  const showPasskeyModalRef = useRef(showPasskeyModal);
  showPasskeyModalRef.current = showPasskeyModal;

  // Load check-ins from database
  const loadCheckIns = useCallback(async () => {
    return dedupe('checkins.load.pending', async () => {
      try {
        const user = await getSessionUser();
        if (!user) {
          setScheduledCheckIns([]);
          return;
        }

        const cacheKey = `deephorizon.cache.checkins.pending.v1.${user.id}`;
        const cached = await QueryCache.get<CheckIn[]>(cacheKey, 2 * 60_000);
        if (Array.isArray(cached) && cached.length > 0) {
          setScheduledCheckIns(cached);
        }

        const checkIns = await CheckInService.getAllCheckIns('pending');
        setScheduledCheckIns(checkIns);
        void QueryCache.set(cacheKey, checkIns).catch(() => {});

        // Clean up presented IDs for check-ins no longer pending (completed/missed/cancelled).
        // This allows a truly new pending check-in with the same slot to trigger correctly.
        const pendingIds = new Set(checkIns.map((c) => c.id));
        presentedCheckInIdsRef.current.forEach((id) => {
          if (!pendingIds.has(id)) presentedCheckInIdsRef.current.delete(id);
        });
      } catch (error) {
        console.error('[useCheckIn] Error loading check-ins:', error);
        // Keep any cached list if present; otherwise empty.
        setScheduledCheckIns((prev) => (Array.isArray(prev) ? prev : []));
      }
    });
  }, []);

  // Load check-ins once auth is ready (avoids querying with expired token during boot/resume)
  useEffect(() => {
    if (!isAuthReady) return;
    loadCheckIns();
    return () => {
      mountedRef.current = false;
    };
  }, [isAuthReady, loadCheckIns]);

  // Periodically reload check-ins every 60 seconds to catch newly scheduled ones
  useEffect(() => {
    if (!isAuthReady) return;

    const reloadInterval = setInterval(() => {
      if (mountedRef.current && AppState.currentState === 'active') {
        console.log('[useCheckIn] Reloading check-ins...');
        loadCheckIns().catch(console.error);
      }
    }, 60000); // Reload every 60 seconds

    return () => clearInterval(reloadInterval);
  }, [isAuthReady, loadCheckIns]);

  // ✅ FIX: Detect due check-ins immediately after first load.
  //
  // On cold start, the periodic 30s interval (below) runs before loadCheckIns()
  // completes, so scheduledCheckInsRef is empty and it finds nothing. This effect
  // watches for the first non-empty load and checks for due check-ins immediately.
  // Without this, the user waits up to 30s for the passkey modal to appear.
  useEffect(() => {
    if (scheduledCheckIns.length === 0 || hasCheckedAfterLoadRef.current) return;
    hasCheckedAfterLoadRef.current = true;

    if (AppState.currentState !== 'active') return;
    if (showPasskeyModalRef.current) return; // Already showing passkey

    const now = Date.now();
    for (const checkIn of scheduledCheckIns) {
      if (checkIn.status !== 'pending') continue;
      if (presentedCheckInIdsRef.current.has(checkIn.id)) continue;
      const scheduledAt = new Date(checkIn.scheduled_at).getTime();
      const timeDiff = now - scheduledAt;
      if (timeDiff >= 0 && timeDiff < 5 * 60 * 1000) {
        console.log(`[useCheckIn] Due check-in detected after load: ${checkIn.id}`);
        presentedCheckInIdsRef.current.add(checkIn.id);
        setActiveCheckIn(checkIn);
        setShowPasskeyModal(true);
        setEnteredPasskey('');
        break; // Only handle first due check-in
      }
    }
  }, [scheduledCheckIns]);

  // Check for due check-ins (foreground only - server sends push notifications)
  // Uses scheduledCheckInsRef so the interval doesn't restart on every array change
  useEffect(() => {
    if (!mountedRef.current) return;

    const checkForDueCheckIns = () => {
      // Only check when app is in foreground
      if (AppState.currentState !== 'active') return;
      // Don't trigger if passkey modal is already showing
      if (showPasskeyModalRef.current) return;

      const now = Date.now();
      for (const checkIn of scheduledCheckInsRef.current) {
        if (checkIn.status !== 'pending') continue;
        // Skip check-ins already presented (completed via CheckInScreen but stale in cache)
        if (presentedCheckInIdsRef.current.has(checkIn.id)) continue;

        const scheduledAt = new Date(checkIn.scheduled_at).getTime();
        const timeDiff = now - scheduledAt;

        // If check-in is due (within last 5 minutes to allow for delays)
        if (timeDiff >= 0 && timeDiff < 5 * 60 * 1000) {
          console.log(`[useCheckIn] Check-in due: ${checkIn.id}`);
          presentedCheckInIdsRef.current.add(checkIn.id);
          setActiveCheckIn(checkIn);
          setShowPasskeyModal(true);
          setEnteredPasskey('');
          break; // Only handle one at a time
        }
      }
    };

    // Check immediately
    checkForDueCheckIns();

    // Check periodically (every 30 seconds) when in foreground
    const interval = setInterval(() => {
      if (!mountedRef.current) return;
      if (AppState.currentState === 'active') {
        checkForDueCheckIns();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- reads from scheduledCheckInsRef

  // Passkey countdown timer - counts down 30 seconds when modal is open
  useEffect(() => {
    if (!showPasskeyModal) {
      // Reset countdown when modal closes
      setPasskeyCountdown(30);
      if (passkeyTimerRef.current) {
        clearInterval(passkeyTimerRef.current);
        passkeyTimerRef.current = null;
      }
      return;
    }

    // Start countdown when modal opens
    setPasskeyCountdown(30);
    
    passkeyTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;

      setPasskeyCountdown((prev) => {
        if (prev <= 1) {
          // Timeout - mark check-in as missed and close modal
          if (activeCheckIn) {
            CheckInService.markMissed(activeCheckIn.id).catch(console.error);
          }
          setShowPasskeyModal(false);
          setActiveCheckIn(null);
          Alert.alert('Time Expired', 'The passkey entry time has expired. Please schedule another check-in.');
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (passkeyTimerRef.current) {
        clearInterval(passkeyTimerRef.current);
        passkeyTimerRef.current = null;
      }
    };
  }, [showPasskeyModal, activeCheckIn]);

  // Schedule check-in
  const scheduleCheckIn = useCallback(async (): Promise<boolean> => {
    if (isScheduling) return false;

    setIsScheduling(true);

    try {
      // Parse the scheduled time
      const scheduledTime = parseDateTime(checkInTime, checkInDate);
      if (!scheduledTime) {
        Alert.alert('Invalid Date/Time', 'Please select a valid date and time for your check-in.');
        return false;
      }

      // Validate scheduled time is in the future
      if (scheduledTime <= new Date()) {
        Alert.alert('Invalid Time', 'Scheduled time must be in the future.');
        return false;
      }

      // Note: Frequency is not stored in the database.
      // For recurring check-ins, we'll need to handle them differently.
      // For now, we'll just schedule the check-in and handle recurring logic separately.
      const result = await CheckInService.schedule({
        scheduled_at: scheduledTime.toISOString(),
        message: checkInNotes || 'Security check-in',
      });

      if (!result.success) {
        Alert.alert('Scheduling Failed', result.error || 'Unable to schedule check-in. Please try again.');
        return false;
      }

      // Reload check-ins
      await loadCheckIns();

      Alert.alert(
        'Check-in Scheduled',
        `Your ${checkInFrequency.toLowerCase()} security check-in has been scheduled for ${formatTime(checkInTime)} on ${checkInDate}.`,
        [{ text: 'OK' }]
      );

      // Reset form
      setCheckInNotes('');

      return true;
    } catch (error: any) {
      console.error('[useCheckIn] Failed to schedule check-in:', error);
      Alert.alert('Scheduling Failed', error.message || 'Unable to schedule check-in. Please try again.');
      return false;
    } finally {
      setIsScheduling(false);
    }
  }, [checkInTime, checkInDate, checkInFrequency, checkInNotes, loadCheckIns]);

  // Cancel check-in
  const cancelCheckIn = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await CheckInService.cancel(id);
      if (success) {
        await loadCheckIns();
        Alert.alert('Check-in Cancelled', 'The security check-in has been cancelled.');
        return true;
      } else {
        Alert.alert('Error', 'Failed to cancel check-in. Please try again.');
        return false;
      }
    } catch (error) {
      console.error('[useCheckIn] Failed to cancel check-in:', error);
      Alert.alert('Error', 'Failed to cancel check-in. Please try again.');
      return false;
    }
  }, [loadCheckIns]);

  // Validate passkey
  const validatePasskey = useCallback(async (input: string): Promise<boolean> => {
    try {
      return await verifyEmergencyPasskey(input);
    } catch (error) {
      console.error('[useCheckIn] Error validating passkey:', error);
      return false;
    }
  }, []);

  // Handle passkey submit
  const handlePasskeySubmit = useCallback(async (): Promise<void> => {
    if (isPasskeyProcessing || !activeCheckIn) {
      return;
    }

    // Capture locally to prevent null crash if state changes during async ops
    const checkIn = activeCheckIn;

    setIsPasskeyProcessing(true);

    try {
      const isValid = await validatePasskey(enteredPasskey);

      if (!mountedRef.current) return;

      if (!isValid) {
        // Get current check-in to check attempts
        const currentCheckIn = await CheckInService.getCheckIn(checkIn.id);
        if (currentCheckIn) {
          const attempts = (currentCheckIn.passkey_attempts || 0) + 1;
          
          // Update check-in with failed attempt (via API if available, otherwise just reload)
          await loadCheckIns();
          
          if (attempts >= 3) {
            // Max attempts reached - mark as missed
            Alert.alert(
              'Security Alert',
              'Maximum passkey attempts reached. Emergency protocol will be activated.',
              [{ text: 'OK' }]
            );
            
            setShowPasskeyModal(false);
            setEnteredPasskey('');
            setActiveCheckIn(null);
            await loadCheckIns();
            return;
          } else {
            Alert.alert(
              'Incorrect Passkey',
              `The passkey you entered is incorrect. ${3 - attempts} attempts remaining.`,
              [{ text: 'Try Again' }]
            );
            setIsPasskeyProcessing(false);
            return;
          }
        } else {
          Alert.alert(
            'Incorrect Passkey',
            'The passkey you entered is incorrect. Please try again.',
            [{ text: 'Try Again' }]
          );
          setIsPasskeyProcessing(false);
          return;
        }
      }

      // Passkey is valid - complete the check-in
      const result = await CheckInService.complete(checkIn.id, true);

      if (result.success) {
        Alert.alert('Check-in Complete', 'Your security check-in has been completed successfully.');
        
        setShowPasskeyModal(false);
        setEnteredPasskey('');
        const completedCheckIn = activeCheckIn;
        setActiveCheckIn(null);
        
        // Reload check-ins
        await loadCheckIns();

        // Note: Since the database doesn't store frequency, we can't automatically
        // schedule the next recurring check-in. For recurring check-ins, users will need
        // to manually schedule them, or we could implement a separate tracking mechanism.
        // For now, we'll just complete the check-in and let the user schedule the next one.
      } else {
        Alert.alert('Error', result.error || 'Failed to complete check-in. Please try again.');
      }
    } catch (error: any) {
      console.error('[useCheckIn] Error during passkey validation:', error);
      Alert.alert('Validation Error', 'There was an error validating your passkey. Please try again.');
    } finally {
      setIsPasskeyProcessing(false);
    }
  }, [isPasskeyProcessing, activeCheckIn, enteredPasskey, validatePasskey, loadCheckIns]);

  return {
    // Form state
    checkInTime,
    setCheckInTime,
    checkInDate,
    setCheckInDate,
    checkInFrequency,
    setCheckInFrequency,
    checkInNotes,
    setCheckInNotes,

    // Check-in management
    scheduledCheckIns,
    isScheduling,
    scheduleCheckIn,
    cancelCheckIn,
    loadCheckIns,

    // Passkey modal state
    showPasskeyModal,
    setShowPasskeyModal,
    enteredPasskey,
    setEnteredPasskey,
    isPasskeyProcessing,
    activeCheckIn,
    passkeyCountdown,

    // Functions
    handlePasskeySubmit,
    validatePasskey,
  };
}

