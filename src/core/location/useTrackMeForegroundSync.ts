import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/core/auth';
import { getActiveTrackMeSession, TrackMeRealtimeData } from '@/api/schedule-checking';
import { trackMeSocketService } from '@/realtime/core';
import { trackMeLocationSyncService } from '@/services/trackMeLocationSync.service';

export function useTrackMeForegroundSync() {
  const { isAuthReady } = useAuth();
  const mountedRef = useRef(true);

  const hydrateActiveTracker = useCallback(async () => {
    try {
      const active = await getActiveTrackMeSession();
      if (!mountedRef.current) return;

      if (active?.isLive && active.trackerId) {
        await trackMeLocationSyncService.start(active.trackerId);
        return;
      }

      await trackMeLocationSyncService.stop();
    } catch {
      // best-effort hydration
    }
  }, []);

  const handleRealtimeTrackMe = useCallback(async (payload: TrackMeRealtimeData) => {
    if (payload.isLive && payload.locationTrackingId) {
      await trackMeLocationSyncService.start(payload.locationTrackingId);
      return;
    }

    await trackMeLocationSyncService.stop();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    mountedRef.current = true;

    const realtimeHandler = (payload: TrackMeRealtimeData) => {
      void handleRealtimeTrackMe(payload);
    };

    const bootstrap = async () => {
      await trackMeSocketService.start();
      await hydrateActiveTracker();
    };

    void bootstrap();
    trackMeSocketService.onTrackMeUpdate(realtimeHandler);

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void hydrateActiveTracker();
      }
    });

    return () => {
      mountedRef.current = false;
      appStateSub.remove();
      trackMeSocketService.offTrackMeUpdate(realtimeHandler);
      void trackMeLocationSyncService.stop();
    };
  }, [isAuthReady, handleRealtimeTrackMe, hydrateActiveTracker]);
}
