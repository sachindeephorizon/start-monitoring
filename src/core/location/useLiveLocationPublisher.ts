import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '@/core/auth';
import { ensureValidSession, supabase } from '@/lib/supabase';
import { apiBaseUrl } from '@/config/environment';

type LiveLocationSource =
  | 'tracking_session'
  | 'video_call'
  | 'audio_call'
  | 'scheduled_checkin';

type LiveLocationContext = {
  source: LiveLocationSource;
  entityId: string;
};

const CONTEXT_REFRESH_MS = 20_000;
const MIN_PUBLISH_INTERVAL_MS = 8_000;
const TRACKING_ACTIVE_STATUSES = ['active', 'paused', 'emergency'] as const;

const refreshListeners = new Set<() => void>();

export function triggerLiveLocationContextRefresh(): void {
  refreshListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // best-effort
    }
  });
}

function toContextKey(ctx: LiveLocationContext): string {
  return `${ctx.source}:${ctx.entityId}`;
}

export function useLiveLocationPublisher() {
  const auth = useAuth();
  const authenticatedUserId = auth.status === 'authenticated' ? auth.user.id : null;
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const contextsRef = useRef<LiveLocationContext[]>([]);
  const latestAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastPublishAtRef = useRef<number>(0);
  const lastLocationRef = useRef<Location.LocationObject | null>(null);
  const contextIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightContextRefreshRef = useRef(false);

  const shouldRun = useMemo(() => {
    return Boolean(auth.isAuthenticated && authenticatedUserId && auth.appState === 'ready');
  }, [auth.isAuthenticated, authenticatedUserId, auth.appState]);

  const stopWatch = useCallback(async () => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
  }, []);

  const publishLocation = useCallback(
    async (location: Location.LocationObject, contexts: LiveLocationContext[]) => {
      if (!shouldRun || contexts.length === 0) return;

      const now = Date.now();
      if (now - lastPublishAtRef.current < MIN_PUBLISH_INTERVAL_MS) return;
      lastPublishAtRef.current = now;

      try {
        const session = await ensureValidSession();
        const token = session?.access_token;
        if (!token) return;

        const payload = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy ?? null,
          altitude: location.coords.altitude ?? null,
          heading: location.coords.heading ?? null,
          speed: location.coords.speed ?? null,
          isMocked: (location as any)?.mocked ?? null,
          capturedAt: new Date(location.timestamp || Date.now()).toISOString(),
          contexts: contexts.map((ctx) => ({ source: ctx.source, entityId: ctx.entityId })),
        };

        const response = await fetch(`${apiBaseUrl}/api/locations/live-update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok && __DEV__) {
          const body = await response.text().catch(() => '');
          console.warn('[LiveLocationPublisher] live-update failed:', response.status, body);
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('[LiveLocationPublisher] publish failed:', error);
        }
      }
    },
    [shouldRun]
  );

  const startWatch = useCallback(async () => {
    if (watchRef.current) return;

    const { status } = await Location.getForegroundPermissionsAsync();
    let granted = status === 'granted';

    if (!granted && status !== 'denied') {
      const req = await Location.requestForegroundPermissionsAsync();
      granted = req.status === 'granted';
    }

    if (!granted) {
      if (__DEV__) console.warn('[LiveLocationPublisher] foreground location permission not granted');
      return;
    }

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10_000,
        distanceInterval: 15,
      },
      (location) => {
        lastLocationRef.current = location;
        publishLocation(location, contextsRef.current);
      }
    );
  }, [publishLocation]);

  const fetchActiveContexts = useCallback(async (): Promise<LiveLocationContext[]> => {
    const userId = authenticatedUserId;
    if (!userId) return [];

    const [trackingRes, videoRes, audioRes, checkinsRes] = await Promise.all([
      supabase
        .from('tracking_sessions')
        .select('id')
        .eq('mobile_user_id', userId)
        .in('status', TRACKING_ACTIVE_STATUSES as unknown as string[])
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('call_sessions')
        .select('id')
        .eq('mobile_user_id', userId)
        .eq('call_type', 'video')
        .in('status', ['waiting', 'initiating', 'connecting', 'connected', 'active'])
        .order('created_at', { ascending: false })
        .limit(2),
      supabase
        .from('call_sessions')
        .select('id')
        .eq('mobile_user_id', userId)
        .eq('call_type', 'audio_call')
        .in('status', ['initiating', 'connecting', 'connected', 'active'])
        .order('created_at', { ascending: false })
        .limit(2),
      supabase
        .from('checkins')
        .select('id')
        .eq('mobile_user_id', userId)
        .in('status', ['pending', 'active'])
        .order('scheduled_at', { ascending: false })
        .limit(5),
    ]);

    const contexts: LiveLocationContext[] = [];

    if (!trackingRes.error && trackingRes.data) {
      for (const row of trackingRes.data) {
        contexts.push({ source: 'tracking_session', entityId: row.id });
      }
    } else if (trackingRes.error && __DEV__) {
      console.warn('[LiveLocationPublisher] tracking context query failed:', trackingRes.error.message);
    }
    if (!videoRes.error && videoRes.data) {
      for (const row of videoRes.data) {
        contexts.push({ source: 'video_call', entityId: row.id });
      }
    } else if (videoRes.error && __DEV__) {
      console.warn('[LiveLocationPublisher] video context query failed:', videoRes.error.message);
    }
    if (!audioRes.error && audioRes.data) {
      for (const row of audioRes.data) {
        contexts.push({ source: 'audio_call', entityId: row.id });
      }
    } else if (audioRes.error && __DEV__) {
      console.warn('[LiveLocationPublisher] audio context query failed:', audioRes.error.message);
    }
    if (!checkinsRes.error && checkinsRes.data) {
      for (const row of checkinsRes.data) {
        contexts.push({ source: 'scheduled_checkin', entityId: row.id });
      }
    } else if (checkinsRes.error && __DEV__) {
      console.warn('[LiveLocationPublisher] check-in context query failed:', checkinsRes.error.message);
    }

    return contexts;
  }, [authenticatedUserId]);

  const refreshContexts = useCallback(async () => {
    if (!shouldRun) return;
    if (inFlightContextRefreshRef.current) return;
    inFlightContextRefreshRef.current = true;

    try {
      const nextContexts = await fetchActiveContexts();
      contextsRef.current = nextContexts;

      if (nextContexts.length > 0) {
        await startWatch();
        if (lastLocationRef.current) {
          publishLocation(lastLocationRef.current, nextContexts);
        } else {
          try {
            const current = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            lastLocationRef.current = current;
            publishLocation(current, nextContexts);
          } catch {
            // best-effort
          }
        }
      } else {
        await stopWatch();
      }
    } finally {
      inFlightContextRefreshRef.current = false;
    }
  }, [shouldRun, fetchActiveContexts, startWatch, stopWatch, publishLocation]);

  useEffect(() => {
    if (!shouldRun) {
      contextsRef.current = [];
      stopWatch();
      if (contextIntervalRef.current) {
        clearInterval(contextIntervalRef.current);
        contextIntervalRef.current = null;
      }
      return;
    }

    refreshContexts();
    if (!contextIntervalRef.current) {
      contextIntervalRef.current = setInterval(refreshContexts, CONTEXT_REFRESH_MS);
    }

    return () => {
      if (contextIntervalRef.current) {
        clearInterval(contextIntervalRef.current);
        contextIntervalRef.current = null;
      }
      stopWatch();
    };
  }, [shouldRun, refreshContexts, stopWatch]);

  useEffect(() => {
    const listener = () => {
      refreshContexts();
    };
    refreshListeners.add(listener);
    return () => {
      refreshListeners.delete(listener);
    };
  }, [refreshContexts]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      latestAppStateRef.current = nextState;
      if (nextState === 'active') {
        refreshContexts();
      }
    });

    return () => {
      sub.remove();
    };
  }, [refreshContexts]);
}
