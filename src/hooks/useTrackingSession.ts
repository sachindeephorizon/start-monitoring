/**
 * Hook for managing tracking sessions with database integration
 * Based on the old app's useTrackingSession but adapted for new architecture
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Platform, AppState } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/core/auth';
import {
  getActiveSession,
  startSession,
  completeSession,
  scheduleNextCheckin,
  markCheckinResult,
  getTrackingCheckinStats,
  getCheckInHistory,
  setActiveTrackingSession,
  TrackingSession,
  TrackingCheckin,
} from '@/services/trackingService';
import { TrackingService } from '@/features/tracking/tracking.service';
import { triggerLiveLocationContextRefresh } from '@/core/location/useLiveLocationPublisher';
import { NOTIFICATION_CHANNELS } from '@/core/notifications/notification.constants';

// Compute the next check-in timestamp aligned with the configured session start time
function computeAlignedCheckin(intervalMin: number, sessionStartMs: number, referenceMs: number): number {
  const intervalMs = intervalMin * 60_000;
  if (referenceMs <= sessionStartMs) {
    return sessionStartMs;
  }
  const elapsed = referenceMs - sessionStartMs;
  const intervalsElapsed = Math.ceil(elapsed / intervalMs);
  return sessionStartMs + intervalsElapsed * intervalMs;
}

// ── Local notification helpers for tracking check-ins ──────────────────
const TRACKING_NOTIF_KEY = 'deephorizon.tracking.local_notif.v1';

async function scheduleTrackingCheckInNotification(sessionId: string, scheduledAtMs: number) {
  try {
    const scheduledAt = new Date(scheduledAtMs);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAtMs <= Date.now()) return;

    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) {
      const req = await Notifications.requestPermissionsAsync();
      if (!req.granted) return;
    }

    // Cancel any previously scheduled tracking notification
    await cancelTrackingCheckInNotification();

    const id = await Notifications.scheduleNotificationAsync({
      content: ({
        title: 'Security Check-In',
        body: 'Enter your passkey to verify your safety.',
        sound: true,
        android: { channelId: NOTIFICATION_CHANNELS.check_ins },
        data: { type: 'tracking_checkin', entity_id: sessionId },
      } as any),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: scheduledAt },
    });

    await AsyncStorage.setItem(TRACKING_NOTIF_KEY, id);
  } catch (e) {
    console.warn('[useTrackingSession] Unable to schedule local notification (non-fatal):', e);
  }
}

async function cancelTrackingCheckInNotification() {
  try {
    const id = await AsyncStorage.getItem(TRACKING_NOTIF_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(TRACKING_NOTIF_KEY);
    }
  } catch (e) {
    // Best-effort
  }
}

export function useTrackingSession() {
  const { isAuthReady } = useAuth();
  const [session, setSession] = useState<TrackingSession | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentCheckin, setCurrentCheckin] = useState<TrackingCheckin | null>(null);
  const [nextCheckinAt, setNextCheckinAt] = useState<number | null>(null);
  const [trackingCountdown, setTrackingCountdown] = useState<string>('--:--');
  const [trackingStats, setTrackingStats] = useState({ success: 0, failed: 0 });
  const [checkInHistory, setCheckInHistory] = useState<TrackingCheckin[]>([]);
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [passkeyTimeLeft, setPasskeyTimeLeft] = useState(30);
  
  const schedulerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const passkeyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  // Track active session ID so long-running setTimeout callbacks can verify
  // the session hasn't changed/completed before firing
  const activeSessionIdRef = useRef<string | null>(null);
  // Keep latest state in refs for async callbacks and AppState handlers
  const currentCheckinRef = useRef(currentCheckin);
  currentCheckinRef.current = currentCheckin;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const nextCheckinAtRef = useRef(nextCheckinAt);
  nextCheckinAtRef.current = nextCheckinAt;
  const showPasskeyModalRef = useRef(showPasskeyModal);
  showPasskeyModalRef.current = showPasskeyModal;

  // Clear all timers
  const clearAllTimers = useCallback(() => {
    if (schedulerTimerRef.current) {
      clearTimeout(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (passkeyTimerRef.current) {
      clearInterval(passkeyTimerRef.current);
      passkeyTimerRef.current = null;
    }
  }, []);

  // Update countdown display
  useEffect(() => {
    if (!nextCheckinAt || !session) {
      setTrackingCountdown('--:--');
      return;
    }

    const updateCountdown = () => {
      if (!mountedRef.current) return;
      
      const now = Date.now();
      const diff = nextCheckinAt - now;
      
      if (diff <= 0) {
        setTrackingCountdown('00:00');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTrackingCountdown(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    };

    updateCountdown();
    countdownTimerRef.current = setInterval(updateCountdown, 1000);

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [nextCheckinAt, session]);

  // Schedule next check-in
  const scheduleNextLocal = useCallback((
    intervalMin: number,
    sessionData: TrackingSession,
    options: { isInitialSchedule?: boolean; referenceTime?: number } = {}
  ) => {
    if (!sessionData) return;

    const sessionStartMs = new Date(sessionData.start_time).getTime();
    const referenceMs = options.referenceTime ?? Date.now();
    const nextAt = computeAlignedCheckin(intervalMin, sessionStartMs, referenceMs);

    if (sessionData.end_time) {
      const sessionEndMs = new Date(sessionData.end_time).getTime();
      if (nextAt > sessionEndMs) {
        setNextCheckinAt(null);
        return;
      }
    }

    setNextCheckinAt(nextAt);

    // Schedule check-in in database
    scheduleNextCheckin(sessionData.id, new Date(nextAt).toISOString())
      .then((checkIn) => {
        if (checkIn && mountedRef.current) {
          setCurrentCheckin(checkIn);
        }
      })
      .catch((error) => {
        console.error('[useTrackingSession] Failed to schedule next check-in:', error);
      });

    // Only clear the scheduler timer — do NOT clear the countdown or passkey timers.
    // The countdown effect manages its own interval via [nextCheckinAt, session] deps.
    if (schedulerTimerRef.current) {
      clearTimeout(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }

    const delay = Math.max(0, nextAt - Date.now());
    const expectedSessionId = sessionData.id;

    schedulerTimerRef.current = setTimeout(() => {
      // Guard: only fire if still mounted AND the session hasn't changed/completed
      if (mountedRef.current && activeSessionIdRef.current === expectedSessionId) {
        setShowPasskeyModal(true);
        setPasskeyTimeLeft(30);
      }
    }, delay);

    // Schedule a local notification as backup (survives app backgrounding)
    scheduleTrackingCheckInNotification(sessionData.id, nextAt).catch(() => {});
  }, []);

  // Initialize: Check for active session on mount (only when auth is ready)
  useEffect(() => {
    if (!isAuthReady) return;
    let mounted = true;
    mountedRef.current = true;

    const initializeTracking = async () => {
      try {
        setLoading(true);
        const active = await getActiveSession();

        if (active && mounted) {
          console.log('[useTrackingSession] Active tracking session found');
          activeSessionIdRef.current = active.id;
          setSession(active);
          setIsTracking(true);
          setActiveTrackingSession(active.id);

          // Start location tracking (optional - will work with foreground location if background not available)
          try {
            await TrackingService.start();
          } catch (error) {
            // Background location not available - this is OK, tracking can work with foreground location
            console.log('[useTrackingSession] Background location not available - tracking will use foreground location only');
          }

          // Load stats and history BEFORE scheduling so we can detect missed check-ins
          const stats = await getTrackingCheckinStats(active.id);
          setTrackingStats(stats);
          const history = await getCheckInHistory(active.id);
          setCheckInHistory(history);

          // ✅ CRITICAL FIX: Detect missed check-in on cold start.
          //
          // When the app was fully killed and reopened (from notification or manually),
          // there's no background→foreground transition for the AppState handler to
          // detect. We must check the DB history for any pending check-in that is past
          // due and show the passkey modal immediately.
          //
          // If we skip this and just call scheduleNextLocal(), the missed check-in is
          // ignored because computeAlignedCheckin() returns the NEXT interval's time.
          const now = Date.now();
          const missedPending = history.find(
            (c) => c.status === 'pending' && new Date(c.scheduled_time).getTime() <= now
          );

          if (missedPending && mounted) {
            console.log('[useTrackingSession] Found missed pending check-in on init:', missedPending.id);
            setCurrentCheckin(missedPending);
            // Show passkey modal immediately. The modal presentation timing is
            // handled by LocationTrackingModal's serviceModalReady gate (via
            // ServiceModal's onShow callback), not by an arbitrary delay here.
            setShowPasskeyModal(true);
            setPasskeyTimeLeft(30);
            // Don't schedule next — passkey handlers (success/failure/timeout)
            // will call scheduleNextLocal() after resolution.
          } else {
            // No missed check-in — schedule next normally
            scheduleNextLocal(active.checkin_interval_minutes, active, { isInitialSchedule: true });
          }
        } else {
          setActiveTrackingSession(null);
        }
      } catch (error) {
        console.error('[useTrackingSession] Error initializing tracking:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    if (Platform.OS === 'ios') {
      initializeTracking();
    } else {
      initializeTracking();
    }

    return () => {
      mounted = false;
      mountedRef.current = false;
      clearAllTimers();
    };
  }, [isAuthReady, scheduleNextLocal, clearAllTimers]);

  // Passkey countdown timer — only counts down, no side effects in updater
  useEffect(() => {
    if (!showPasskeyModal) {
      if (passkeyTimerRef.current) {
        clearInterval(passkeyTimerRef.current);
        passkeyTimerRef.current = null;
      }
      return;
    }

    passkeyTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      setPasskeyTimeLeft((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);

    return () => {
      if (passkeyTimerRef.current) {
        clearInterval(passkeyTimerRef.current);
        passkeyTimerRef.current = null;
      }
    };
  }, [showPasskeyModal]);

  // Passkey timeout handler — triggers when countdown reaches 0
  useEffect(() => {
    if (passkeyTimeLeft !== 0 || !showPasskeyModal) return;

    // Stop the countdown interval
    if (passkeyTimerRef.current) {
      clearInterval(passkeyTimerRef.current);
      passkeyTimerRef.current = null;
    }

    // Mark check-in as timed out
    const checkin = currentCheckinRef.current;
    if (checkin) {
      markCheckinResult(checkin.id, 'timeout').catch(console.error);
    }

    setShowPasskeyModal(false);
    setPasskeyTimeLeft(30);

    // Schedule next check-in
    const sess = sessionRef.current;
    if (sess) {
      scheduleNextLocal(sess.checkin_interval_minutes, sess, {
        referenceTime: Date.now(),
      });
    }
  }, [passkeyTimeLeft, showPasskeyModal, scheduleNextLocal]);

  // Create tracking session
  const createSession = useCallback(async (
    startTime: Date,
    endTime: Date,
    interval: number
  ): Promise<boolean> => {
    try {
      setLoading(true);
      
      const session = await startSession(
        interval,
        endTime.toISOString(),
        startTime.toISOString()
      );
      
      activeSessionIdRef.current = session.id;
      setSession(session);
      setIsTracking(true);
      setActiveTrackingSession(session.id);
      triggerLiveLocationContextRefresh();

      // Start location tracking (optional - will work with foreground location if background not available)
      try {
        await TrackingService.start();
      } catch (error) {
        // Background location not available - this is OK, tracking can work with foreground location
        console.log('[useTrackingSession] Background location not available - tracking will use foreground location only');
      }

      // Schedule first check-in
      scheduleNextLocal(session.checkin_interval_minutes, session, {
        referenceTime: Date.now(),
      });
      
      return true;
    } catch (error) {
      console.error('[useTrackingSession] Error creating session:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [scheduleNextLocal]);

  // Complete tracking session
  const completeTrackingSession = useCallback(async (): Promise<boolean> => {
    if (!session) return false;

    try {
      setLoading(true);

      await completeSession(session.id);
      // Stop location tracking (if it was started)
      try {
        await TrackingService.stop();
      } catch (error) {
        // Location tracking may not have been started - this is OK
        console.log('[useTrackingSession] Location tracking was not active');
      }

      clearAllTimers();
      cancelTrackingCheckInNotification().catch(() => {});
      activeSessionIdRef.current = null;
      setSession(null);
      setIsTracking(false);
      setCurrentCheckin(null);
      setNextCheckinAt(null);
      setShowPasskeyModal(false);
      setActiveTrackingSession(null);
      triggerLiveLocationContextRefresh();

      return true;
    } catch (error) {
      console.error('[useTrackingSession] Error completing session:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [session, clearAllTimers]);

  // Handle passkey success
  const onPasskeySuccess = useCallback(async () => {
    setShowPasskeyModal(false);
    
    if (currentCheckin) {
      try {
        await markCheckinResult(currentCheckin.id, 'success');
        setCurrentCheckin(null);
      } catch (error) {
        console.error('[useTrackingSession] Error marking check-in as success:', error);
      }
    }
    
    if (session) {
      // Refresh stats
      const stats = await getTrackingCheckinStats(session.id);
      setTrackingStats(stats);
      const history = await getCheckInHistory(session.id);
      setCheckInHistory(history);
      
      // Schedule next check-in
      scheduleNextLocal(session.checkin_interval_minutes, session, {
        referenceTime: Date.now(),
      });
    }
  }, [currentCheckin, session, scheduleNextLocal]);

  // Handle passkey failure
  const onPasskeyFailure = useCallback(async () => {
    setShowPasskeyModal(false);
    
    if (currentCheckin) {
      try {
        await markCheckinResult(currentCheckin.id, 'failed');
        setCurrentCheckin(null);
      } catch (error) {
        console.error('[useTrackingSession] Error marking check-in as failed:', error);
      }
    }
    
    if (session) {
      // Refresh stats
      const stats = await getTrackingCheckinStats(session.id);
      setTrackingStats(stats);
      const history = await getCheckInHistory(session.id);
      setCheckInHistory(history);
      
      // Schedule next check-in
      scheduleNextLocal(session.checkin_interval_minutes, session, {
        referenceTime: Date.now(),
      });
    }
  }, [currentCheckin, session, scheduleNextLocal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      activeSessionIdRef.current = null;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Re-evaluate schedule when app returns from background
  useEffect(() => {
    if (!isTracking) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        const sess = sessionRef.current;
        if (!sess || !mountedRef.current) return;

        // Verify session ID matches active session (guard against stale closure)
        const activeSessionId = activeSessionIdRef.current;
        if (sess.id !== activeSessionId) {
          console.log('[useTrackingSession] Session ID mismatch after background, skipping recovery');
          return;
        }

        const sessionEndMs = new Date(sess.end_time).getTime();
        const now = Date.now();

        if (now >= sessionEndMs) {
          // Session has expired while app was in the background — auto-complete
          console.log('[useTrackingSession] Session expired while backgrounded, auto-completing...');
          completeTrackingSession();
          return;
        }

        // Check if a check-in was MISSED while app was backgrounded
        const dueAt = nextCheckinAtRef.current;
        if (dueAt && now >= dueAt && !showPasskeyModalRef.current) {
          console.log('[useTrackingSession] Check-in was due while backgrounded — showing passkey modal now');
          setShowPasskeyModal(true);
          setPasskeyTimeLeft(30);
          return;
        }

        // Re-schedule next check-in (timer may have been killed by OS)
        scheduleNextLocal(sess.checkin_interval_minutes, sess, {
          referenceTime: now,
        });
      }
    });

    return () => subscription.remove();
  }, [isTracking, scheduleNextLocal, completeTrackingSession]);

  const nextTrackingCheckIn = useMemo(() => {
    if (!nextCheckinAt) return null;
    return new Date(nextCheckinAt);
  }, [nextCheckinAt]);

  return {
    // State
    session,
    isTracking,
    loading,
    currentCheckin,
    nextCheckinAt,
    nextTrackingCheckIn,
    trackingCountdown,
    trackingStats,
    checkInHistory,
    showPasskeyModal,
    passkeyTimeLeft,
    
    // Actions
    createSession,
    completeTrackingSession,
    onPasskeySuccess,
    onPasskeyFailure,
    setShowPasskeyModal,
  };
}
