/**
 * Check-In Hook
 *
 * Backend-integrated hook for scheduled check-ins.
 * This version uses /v1/schedule-checkin routes and avoids Supabase access.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CheckInTime, CheckInFrequency as UiCheckInFrequency } from '@/types/checkin';
import { parseFullDateLabel } from '@/utils/dateFormat';
import { useAuth } from '@/core/auth';
import {
  cancelScheduleCheckIn,
  createScheduleCheckIn,
  getMyScheduleCheckIns,
  getScheduleCheckInJobs,
  processDueCheckins,
  updateCheckinJobStatus,
  type CheckinFrequency,
  type CheckinStatus,
} from '@/api/schedule-checking';

const DEFAULT_DUE_WINDOW_MS = 5 * 60 * 1000;
const SAFETY_POLL_MS = 3_000;
const PENDING_HINTS_STORAGE_KEY = 'deephorizon.checkins.pendingHints.v1';

const formatDateString = (date: Date): string => {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayName = dayNames[date.getDay()];
  const month = monthNames[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `${dayName}, ${month} ${day}, ${year}`;
};

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

const formatTime = (time: CheckInTime): string => {
  const hours = time.hours === 0 ? 12 : time.hours > 12 ? time.hours - 12 : time.hours;
  const minutes = time.minutes.toString().padStart(2, '0');
  return `${hours}:${minutes} ${time.period}`;
};

const toApiFrequency = (frequency: UiCheckInFrequency): CheckinFrequency => {
  switch (frequency) {
    case 'Daily':
      return 'DAILY';
    case 'Weekly':
      return 'WEEKLY';
    case 'One-time':
    default:
      return 'ONE_TIME';
  }
};

const toUiFrequency = (frequency: CheckinFrequency): UiCheckInFrequency => {
  switch (frequency) {
    case 'DAILY':
      return 'Daily';
    case 'WEEKLY':
      return 'Weekly';
    case 'ONE_TIME':
    default:
      return 'One-time';
  }
};

interface ScheduledCheckInItem {
  id: string;
  startAt: string;
  notes?: string;
  frequency: UiCheckInFrequency;
  status: CheckinStatus;
  gracePeriodMinutes?: number | null;
}

interface ActiveCheckInJob {
  id: string;
  checkinId: string;
  scheduledAt: string;
  attempts: number;
}

interface PendingScheduleHint {
  startAt: string;
  createdAtMs: number;
}

export interface UseCheckInReturn {
  checkInTime: CheckInTime;
  setCheckInTime: (time: CheckInTime) => void;
  checkInDate: string;
  setCheckInDate: (date: string) => void;
  checkInFrequency: UiCheckInFrequency;
  setCheckInFrequency: (frequency: UiCheckInFrequency) => void;
  checkInNotes: string;
  setCheckInNotes: (notes: string) => void;

  scheduledCheckIns: ScheduledCheckInItem[];
  isLoadingCheckIns: boolean;
  isScheduling: boolean;
  scheduleCheckIn: () => Promise<boolean>;
  cancelCheckIn: (id: string) => Promise<boolean>;
  loadCheckIns: () => Promise<void>;

  showPasskeyModal: boolean;
  setShowPasskeyModal: (show: boolean) => void;
  enteredPasskey: string;
  setEnteredPasskey: (passkey: string) => void;
  isPasskeyProcessing: boolean;
  activeCheckIn: ActiveCheckInJob | null;
  passkeyCountdown: number;

  handlePasskeySubmit: () => Promise<void>;
}

export interface UseCheckInOptions {
  enableDueWatcher?: boolean;
}

export function useCheckIn(options: UseCheckInOptions = {}): UseCheckInReturn {
  const { enableDueWatcher = true } = options;
  const { isAuthReady } = useAuth();

  const [checkInTime, setCheckInTime] = useState<CheckInTime>({
    hours: 12,
    minutes: 0,
    period: 'PM',
  });
  const [checkInDate, setCheckInDate] = useState<string>(() => formatDateString(new Date()));
  const [checkInFrequency, setCheckInFrequency] = useState<UiCheckInFrequency>('One-time');
  const [checkInNotes, setCheckInNotes] = useState<string>('');

  const [scheduledCheckIns, setScheduledCheckIns] = useState<ScheduledCheckInItem[]>([]);
  const [scheduledJobs, setScheduledJobs] = useState<ActiveCheckInJob[]>([]);
  const [isLoadingCheckIns, setIsLoadingCheckIns] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);

  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [enteredPasskey, setEnteredPasskey] = useState('');
  const [isPasskeyProcessing, setIsPasskeyProcessing] = useState(false);
  const [activeCheckIn, setActiveCheckIn] = useState<ActiveCheckInJob | null>(null);
  const [passkeyCountdown, setPasskeyCountdown] = useState(30);

  const mountedRef = useRef(true);
  const passkeyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadCheckInsRef = useRef<() => Promise<void>>(async () => {});
  const scheduledCheckInsRef = useRef<ScheduledCheckInItem[]>([]);
  scheduledCheckInsRef.current = scheduledCheckIns;
  const scheduledJobsRef = useRef<ActiveCheckInJob[]>([]);
  scheduledJobsRef.current = scheduledJobs;
  const pendingHintsRef = useRef<PendingScheduleHint[]>([]);
  const isLoadingCheckInsRef = useRef(false);

  const presentedJobIdsRef = useRef<Set<string>>(new Set());
  const showPasskeyModalRef = useRef(showPasskeyModal);
  showPasskeyModalRef.current = showPasskeyModal;

  const savePendingHints = useCallback(async (hints: PendingScheduleHint[]) => {
    try {
      await AsyncStorage.setItem(PENDING_HINTS_STORAGE_KEY, JSON.stringify(hints));
    } catch {
      // Best-effort
    }
  }, []);

  const addPendingHint = useCallback(async (startAt: string) => {
    const now = Date.now();
    const nextHints = [
      ...pendingHintsRef.current.filter((h) => now - h.createdAtMs < 12 * 60 * 60 * 1000),
      { startAt, createdAtMs: now },
    ];
    pendingHintsRef.current = nextHints;
    await savePendingHints(nextHints);
  }, [savePendingHints]);

  const prunePendingHints = useCallback(async () => {
    const now = Date.now();
    const pruned = pendingHintsRef.current.filter((h) => now - h.createdAtMs < 12 * 60 * 60 * 1000);
    if (pruned.length !== pendingHintsRef.current.length) {
      pendingHintsRef.current = pruned;
      await savePendingHints(pruned);
    }
  }, [savePendingHints]);

  const checkForDueJobs = useCallback(() => {
    if (AppState.currentState !== 'active') return;
    if (showPasskeyModalRef.current) return;

    const now = Date.now();
    for (const job of scheduledJobsRef.current) {
      if (presentedJobIdsRef.current.has(job.id)) continue;

      const scheduledAt = new Date(job.scheduledAt).getTime();
      const timeDiff = now - scheduledAt;
      // Backend is source of truth: if a job is still SCHEDULED and its time has
      // passed, we should prompt immediately (even after app relaunch).
      if (timeDiff >= 0) {
        console.log('[useCheckIn] Due check-in job detected:', job.id);
        presentedJobIdsRef.current.add(job.id);
        setActiveCheckIn(job);
        setEnteredPasskey('');
        setShowPasskeyModal(true);
        break;
      }
    }

    const hasDueScheduleWithoutJobs =
      scheduledJobsRef.current.length === 0 &&
      scheduledCheckInsRef.current.some((schedule) => {
        const scheduleTime = new Date(schedule.startAt).getTime();
        const timeDiff = now - scheduleTime;
        const dueWindowMs =
          typeof schedule.gracePeriodMinutes === 'number' && schedule.gracePeriodMinutes > 0
            ? schedule.gracePeriodMinutes * 60 * 1000
            : DEFAULT_DUE_WINDOW_MS;
        return timeDiff >= 0 && timeDiff < dueWindowMs;
      });

    const hasDuePendingHintWithoutJobs =
      scheduledJobsRef.current.length === 0 &&
      pendingHintsRef.current.some((hint) => {
        const scheduleTime = new Date(hint.startAt).getTime();
        const timeDiff = now - scheduleTime;
        return timeDiff >= 0 && timeDiff < DEFAULT_DUE_WINDOW_MS;
      });

    if ((hasDueScheduleWithoutJobs || hasDuePendingHintWithoutJobs) && !isLoadingCheckInsRef.current) {
      console.warn('[useCheckIn] Due schedule hint found but no SCHEDULED jobs returned. Refreshing from backend.');
      void loadCheckInsRef.current().catch(console.error);
    }
  }, []);

  const loadCheckIns = useCallback(async () => {
    if (isLoadingCheckInsRef.current) return;
    isLoadingCheckInsRef.current = true;
    setIsLoadingCheckIns(true);
    try {
      // Best-effort manual trigger so jobs become executable promptly.
      await processDueCheckins({ limit: 100 }).catch((err) => {
        console.warn('[useCheckIn] processDueCheckins failed (non-fatal):', err);
      });

      const schedules = await getMyScheduleCheckIns('ACTIVE');

      const mappedSchedules: ScheduledCheckInItem[] = schedules.map((schedule) => ({
        id: schedule.id,
        startAt: schedule.startAt,
        notes: schedule.remarks ?? undefined,
        frequency: toUiFrequency(schedule.frequency),
        status: schedule.status,
        gracePeriodMinutes: schedule.gracePeriodMinutes,
      }));
      setScheduledCheckIns(mappedSchedules);

      const jobsLists = await Promise.all(
        schedules.map(async (schedule) => {
          const jobs = await getScheduleCheckInJobs(schedule.id).catch((err) => {
            console.warn(`[useCheckIn] Failed to load jobs for schedule ${schedule.id}:`, err);
            return [];
          });
          return jobs
            .filter((job) => job.status === 'SCHEDULED')
            .map((job) => ({
              id: job.id,
              checkinId: schedule.id,
              scheduledAt: job.scheduledAt,
              attempts: job.attempts,
            }));
        }),
      );

      const allScheduledJobs = jobsLists
        .flat()
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

      // Keep ref in sync immediately so due check can run right away without waiting
      // for next render/interval tick.
      scheduledJobsRef.current = allScheduledJobs;
      setScheduledJobs(allScheduledJobs);

      const pendingJobIds = new Set(allScheduledJobs.map((job) => job.id));
      presentedJobIdsRef.current.forEach((jobId) => {
        if (!pendingJobIds.has(jobId)) {
          presentedJobIdsRef.current.delete(jobId);
        }
      });

      await prunePendingHints();

      // Evaluate due jobs immediately after load to avoid 30s delay.
      checkForDueJobs();
    } catch (error) {
      console.error('[useCheckIn] Error loading schedule check-ins:', error);
      setScheduledCheckIns((prev) => (Array.isArray(prev) ? prev : []));
      setScheduledJobs((prev) => (Array.isArray(prev) ? prev : []));
    } finally {
      setIsLoadingCheckIns(false);
      isLoadingCheckInsRef.current = false;
    }
  }, [checkForDueJobs, prunePendingHints]);
  loadCheckInsRef.current = loadCheckIns;

  useEffect(() => {
    let isMounted = true;
    const loadHints = async () => {
      try {
        const raw = await AsyncStorage.getItem(PENDING_HINTS_STORAGE_KEY);
        if (!raw || !isMounted) return;
        const parsed = JSON.parse(raw) as PendingScheduleHint[];
        if (Array.isArray(parsed)) {
          pendingHintsRef.current = parsed;
          await prunePendingHints();
        }
      } catch {
        // Ignore invalid storage contents
      }
    };
    void loadHints();
    return () => {
      isMounted = false;
    };
  }, [prunePendingHints]);

  useEffect(() => {
    if (!isAuthReady) return;
    loadCheckIns();
    return () => {
      mountedRef.current = false;
    };
  }, [isAuthReady, loadCheckIns]);

  useEffect(() => {
    if (!isAuthReady) return;

    const reloadInterval = setInterval(() => {
      if (mountedRef.current && AppState.currentState === 'active') {
        loadCheckIns().catch(console.error);
      }
    }, 60_000);

    return () => clearInterval(reloadInterval);
  }, [isAuthReady, loadCheckIns]);

  useEffect(() => {
    if (!enableDueWatcher) return;
    if (!mountedRef.current) return;

    checkForDueJobs();

    let nextDueTimer: ReturnType<typeof setTimeout> | null = null;
    const unsurfacedJobs = scheduledJobs.filter((job) => !presentedJobIdsRef.current.has(job.id));
    if (unsurfacedJobs.length > 0) {
      const now = Date.now();
      const nextScheduledAt = unsurfacedJobs
        .map((job) => new Date(job.scheduledAt).getTime())
        .filter((ts) => !Number.isNaN(ts))
        .sort((a, b) => a - b)[0];

      if (typeof nextScheduledAt === 'number') {
        const delayMs = Math.max(150, nextScheduledAt - now + 150);
        nextDueTimer = setTimeout(() => {
          if (!mountedRef.current) return;
          checkForDueJobs();
        }, delayMs);
      }
    }

    const interval = setInterval(() => {
      if (!mountedRef.current) return;
      checkForDueJobs();
    }, SAFETY_POLL_MS);

    return () => {
      clearInterval(interval);
      if (nextDueTimer) clearTimeout(nextDueTimer);
    };
  }, [enableDueWatcher, checkForDueJobs, scheduledJobs]);

  useEffect(() => {
    if (!enableDueWatcher) return;
    if (!isAuthReady) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (!mountedRef.current) return;
      if (nextState !== 'active') return;

      // Instant check with current in-memory jobs, then refresh and re-check.
      checkForDueJobs();
      void loadCheckIns().then(() => {
        if (!mountedRef.current) return;
        checkForDueJobs();
      }).catch(console.error);
    });

    return () => subscription.remove();
  }, [enableDueWatcher, isAuthReady, loadCheckIns, checkForDueJobs]);

  useEffect(() => {
    if (!showPasskeyModal) {
      setPasskeyCountdown(30);
      if (passkeyTimerRef.current) {
        clearInterval(passkeyTimerRef.current);
        passkeyTimerRef.current = null;
      }
      return;
    }

    setPasskeyCountdown(30);

    passkeyTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;

      setPasskeyCountdown((prev) => {
        if (prev <= 1) {
          if (activeCheckIn) {
            // Backend owns missed determination; trigger due processing and refresh.
            void processDueCheckins({ limit: 100 }).catch(console.error);
            void loadCheckIns();
          }

          setShowPasskeyModal(false);
          setActiveCheckIn(null);
          setEnteredPasskey('');
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
  }, [showPasskeyModal, activeCheckIn, loadCheckIns]);

  const scheduleCheckIn = useCallback(async (): Promise<boolean> => {
    if (isScheduling) return false;

    setIsScheduling(true);

    try {
      const scheduledTime = parseDateTime(checkInTime, checkInDate);
      if (!scheduledTime) {
        Alert.alert('Invalid Date/Time', 'Please select a valid date and time for your check-in.');
        return false;
      }

      if (scheduledTime <= new Date()) {
        Alert.alert('Invalid Time', 'Scheduled time must be in the future.');
        return false;
      }

      const createdSchedule = await createScheduleCheckIn({
        startAt: scheduledTime.toISOString(),
        frequency: toApiFrequency(checkInFrequency),
        remarks: checkInNotes || undefined,
      });

      await addPendingHint(createdSchedule.startAt);

      await loadCheckIns();

      Alert.alert(
        'Check-in Scheduled',
        `Your ${checkInFrequency.toLowerCase()} security check-in has been scheduled for ${formatTime(checkInTime)} on ${checkInDate}.`,
        [{ text: 'OK' }],
      );

      setCheckInNotes('');
      return true;
    } catch (error: any) {
      console.error('[useCheckIn] Failed to schedule check-in:', error);
      Alert.alert('Scheduling Failed', error?.message || 'Unable to schedule check-in. Please try again.');
      return false;
    } finally {
      setIsScheduling(false);
    }
  }, [isScheduling, checkInTime, checkInDate, checkInFrequency, checkInNotes, addPendingHint, loadCheckIns]);

  const cancelCheckIn = useCallback(async (id: string): Promise<boolean> => {
    try {
      const cancelled = await cancelScheduleCheckIn(id);
      const success = cancelled.status === 'CANCELLED';

      if (success) {
        await loadCheckIns();
        Alert.alert('Check-in Cancelled', 'The security check-in has been cancelled.');
        return true;
      }

      Alert.alert('Error', 'Failed to cancel check-in. Please try again.');
      return false;
    } catch (error) {
      console.error('[useCheckIn] Failed to cancel check-in:', error);
      Alert.alert('Error', 'Failed to cancel check-in. Please try again.');
      return false;
    }
  }, [loadCheckIns]);

  const handlePasskeySubmit = useCallback(async (): Promise<void> => {
    if (isPasskeyProcessing || !activeCheckIn) {
      return;
    }

    const job = activeCheckIn;
    setIsPasskeyProcessing(true);

    try {
      const result = await updateCheckinJobStatus(job.id, {
        passcode: enteredPasskey,
      });

      if (!mountedRef.current) return;

      if (!result.passcodeMatched) {
        if (result.status === 'WRONG_PIN' || result.remainingAttempts <= 0) {
          Alert.alert(
            'Security Alert',
            'Maximum passkey attempts reached. Emergency protocol will be activated.',
            [{ text: 'OK' }],
          );

          setShowPasskeyModal(false);
          setEnteredPasskey('');
          setActiveCheckIn(null);
          await loadCheckIns();
          return;
        }

        Alert.alert(
          'Incorrect Passkey',
          `The passkey you entered is incorrect. ${result.remainingAttempts} attempts remaining.`,
          [{ text: 'Try Again' }],
        );
        return;
      }

      Alert.alert('Check-in Complete', 'Your security check-in has been completed successfully.');
      setShowPasskeyModal(false);
      setEnteredPasskey('');
      setActiveCheckIn(null);

      await loadCheckIns();
    } catch (error) {
      console.error('[useCheckIn] Error during passkey handling:', error);
      Alert.alert('Validation Error', 'There was an error validating your passkey. Please try again.');
    } finally {
      setIsPasskeyProcessing(false);
    }
  }, [isPasskeyProcessing, activeCheckIn, enteredPasskey, loadCheckIns]);

  return {
    checkInTime,
    setCheckInTime,
    checkInDate,
    setCheckInDate,
    checkInFrequency,
    setCheckInFrequency,
    checkInNotes,
    setCheckInNotes,

    scheduledCheckIns,
    isLoadingCheckIns,
    isScheduling,
    scheduleCheckIn,
    cancelCheckIn,
    loadCheckIns,

    showPasskeyModal,
    setShowPasskeyModal,
    enteredPasskey,
    setEnteredPasskey,
    isPasskeyProcessing,
    activeCheckIn,
    passkeyCountdown,

    handlePasskeySubmit,
  };
}
