/**
 * Background location task for Start Monitoring.
 *
 * The OS can wake this task even when the JS bundle is otherwise paused
 * (Android Doze, iOS suspended app). The handler runs in an isolated JS
 * instance — no React context, no useState. It bridges to the rest of the
 * app via SecureStore.
 *
 * Pattern mirrors the rewp1 reference implementation, adapted for our
 * existing /:userId/ping API.
 *
 * IMPORTANT: This file must be imported eagerly (at app entry, before any
 * navigation mounts) so `TaskManager.defineTask` registers the handler
 * BEFORE the OS tries to deliver background events.
 */

import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { pingLocation, PingPayload } from '@/api/monitoring';

export const MONITORING_BG_TASK = 'monitoring-background-location';

// SecureStore keys used to hand off auth + session state from the React tree
// to the isolated background JS instance. Must match what MonitoringSession
// writes on startSession / clears on endSession.
export const BG_KEYS = {
  active: 'monitoring_bg_active',          // 'true' while session is live
  userId: 'monitoring_bg_user_id',
  sessionId: 'monitoring_bg_session_id',
  appState: 'monitoring_bg_app_state',     // 'foreground' | 'background'
  sequence: 'monitoring_bg_sequence',      // monotonic ping counter
};

// Per-task fix from expo-location. Trimmed to the fields we use.
interface NativeLocation {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
  };
  timestamp: number;
}

TaskManager.defineTask(MONITORING_BG_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[bg-task] location error:', error.message);
    return;
  }
  if (!data) return;

  try {
    // Gate everything on the explicit "session is active" flag — if a stale
    // task delivery arrives after endSession, we silently no-op.
    const active = await SecureStore.getItemAsync(BG_KEYS.active);
    if (active !== 'true') return;

    const userId = await SecureStore.getItemAsync(BG_KEYS.userId);
    if (!userId) return;
    const sessionId = await SecureStore.getItemAsync(BG_KEYS.sessionId);
    const appState = (await SecureStore.getItemAsync(BG_KEYS.appState)) ?? 'background';
    const seqRaw = await SecureStore.getItemAsync(BG_KEYS.sequence);
    let sequence = seqRaw ? Number(seqRaw) : 0;

    const taskData = data as { locations?: NativeLocation[] };
    const locations = Array.isArray(taskData.locations) ? taskData.locations : [];
    if (locations.length === 0) return;

    // The OS often batches multiple fixes in a single delivery. Send each
    // as a separate ping in chronological order so the backend's deviation
    // streak / inactivity window get the right cadence.
    const sorted = [...locations].sort(
      (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
    );

    for (const loc of sorted) {
      sequence += 1;
      const speed = loc.coords.speed ?? 0;
      const moving = speed > 0.6;
      const payload: PingPayload = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? undefined,
        speed: speed,
        heading: loc.coords.heading ?? undefined,
        timestamp: loc.timestamp,
        moving,
        source: 'background_task',
        appState,
        sequence,
        sessionId: sessionId ?? undefined,
      };
      try {
        await pingLocation(userId, payload);
      } catch (e: any) {
        console.warn(
          `[bg-task] ping seq=${sequence} failed: ${e?.message ?? 'unknown'}`,
        );
      }
    }

    await SecureStore.setItemAsync(BG_KEYS.sequence, String(sequence));
  } catch (e: any) {
    console.warn('[bg-task] handler crashed:', e?.message ?? e);
  }
});
