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
  // Persisted so the foreground UI can rehydrate after the JS bundle is
  // killed (app swiped from Recents) while the native BG service keeps
  // running. Without these, reopening the app shows "Start Monitoring"
  // even though GPS is still pinging in the background.
  startedAt: 'monitoring_bg_started_at',   // ms epoch
  tripType: 'monitoring_bg_trip_type',     // TripType string
  // Cumulative traveled distance + last known fix. Written by both the
  // foreground watcher and the background task so the summary screen has
  // a real number to show regardless of which path the user was on.
  distanceM: 'monitoring_bg_distance_m',
  lastLat: 'monitoring_bg_last_lat',
  lastLng: 'monitoring_bg_last_lng',
  // Check-in countdown anchors, persisted so rehydration (after app kill)
  // restores the real deadline instead of resetting to "now + interval".
  // Without these, stale scheduled notifications and the newly-computed
  // deadline get out of sync → prompts fire at random times.
  nextCheckinAt: 'monitoring_bg_next_checkin_at', // ISO string
  lastCheckinAt: 'monitoring_bg_last_checkin_at', // ms epoch
  // Destination persisted so rehydration restores the target the user set
  // before the app was killed. Without these, the destination + route tile
  // come back empty and the 250 m auto-stop can't evaluate until the user
  // re-enters the drop-off.
  destinationLat: 'monitoring_bg_destination_lat',
  destinationLng: 'monitoring_bg_destination_lng',
  destinationName: 'monitoring_bg_destination_name',
};

// Haversine distance in meters between two WGS-84 points.
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Add this GPS fix's contribution to the cumulative traveled distance.
 * Filters out noisy jumps: GPS accuracy < 50m and movement < 1000m.
 * Called from both the foreground watcher and the background task.
 */
export async function updateTraveledDistance(
  lat: number,
  lng: number,
  accuracyM?: number | null,
): Promise<void> {
  try {
    if (accuracyM != null && accuracyM > 50) return; // junk fix — skip
    const [lastLatRaw, lastLngRaw, distRaw] = await Promise.all([
      SecureStore.getItemAsync(BG_KEYS.lastLat),
      SecureStore.getItemAsync(BG_KEYS.lastLng),
      SecureStore.getItemAsync(BG_KEYS.distanceM),
    ]);
    const lastLat = lastLatRaw ? Number(lastLatRaw) : null;
    const lastLng = lastLngRaw ? Number(lastLngRaw) : null;
    let total = distRaw ? Number(distRaw) : 0;
    if (!Number.isFinite(total)) total = 0;

    if (lastLat != null && lastLng != null && Number.isFinite(lastLat) && Number.isFinite(lastLng)) {
      const step = haversineMeters(lastLat, lastLng, lat, lng);
      // Drop teleport-sized jumps (>1 km in one fix) — almost certainly GPS glitch.
      if (Number.isFinite(step) && step < 1000) {
        total += step;
      }
    }

    await Promise.all([
      SecureStore.setItemAsync(BG_KEYS.lastLat, String(lat)),
      SecureStore.setItemAsync(BG_KEYS.lastLng, String(lng)),
      SecureStore.setItemAsync(BG_KEYS.distanceM, String(total)),
    ]);
  } catch {
    // Telemetry only — never break the ping pipeline.
  }
}

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

    // ── ISSUE 6 FIX: The OS often hands us 2-5 batched fixes per delivery.
    // Awaiting pings sequentially with no spacing fires them ~50 ms apart
    // and the backend's 800 ms rate-limiter rejects everything after the
    // first with 429. Pace them just over the limit so all batched fixes
    // make it through.
    const PING_GAP_MS = 850;

    for (let i = 0; i < sorted.length; i++) {
      const loc = sorted[i];
      sequence += 1;
      const speed = loc.coords.speed ?? 0;
      const moving = speed > 0.6;
      await updateTraveledDistance(
        loc.coords.latitude,
        loc.coords.longitude,
        loc.coords.accuracy,
      );
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
        const res = await pingLocation(userId, payload);
        // Backend says session has been stopped — stop draining the batch.
        if ((res as any)?.stopped) {
          console.log('[bg-task] backend reports session stopped — aborting batch');
          await SecureStore.setItemAsync(BG_KEYS.active, 'false').catch(() => {});
          break;
        }
      } catch (e: any) {
        console.warn(
          `[bg-task] ping seq=${sequence} failed: ${e?.message ?? 'unknown'}`,
        );
      }
      // Pace requests so the rate-limiter doesn't reject the rest of the batch.
      if (i < sorted.length - 1) {
        await new Promise((r) => setTimeout(r, PING_GAP_MS));
      }
    }
    await SecureStore.setItemAsync(BG_KEYS.sequence, String(sequence));
  } catch (e: any) {
    console.warn('[bg-task] handler crashed:', e?.message ?? e);
  }
});
