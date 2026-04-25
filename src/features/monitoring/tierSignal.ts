/**
 * Tier Signal Service
 *
 * Tier mapping (per product spec):
 *   Tier 1 — Passive   · cell tower / WiFi only, NO GPS  · max battery
 *   Tier 2 — Active    · GPS balanced                    · short_deviation OR inactivity
 *   Tier 3 — Emergency · GPS at full potential           · long_deviation OR missed_checkin
 *
 * Inactivity is computed internally from position samples:
 *   distance covered in last 10 min < 30 m AND not near destination.
 *
 * Signals decay automatically (T2 after 5 min, T3 after 10 min) so a
 * resolved deviation eventually drops the user back to T1 even if the
 * upstream service never sends `clear_all`.
 *
 * The service is intentionally framework-agnostic — no React, no fetch.
 * It receives signals + positions, emits tier-change callbacks. Wire it
 * into MonitoringSession (or any other host) at the boundary.
 */

export type SignalType =
  | 'short_deviation'
  | 'long_deviation'
  | 'missed_checkin'
  | 'user_needs_help'
  | 'inactivity'
  | 'clear_all';

export type TierLevel = 1 | 2 | 3;

export type TierReason = SignalType | 'default';

export type TierChangeCallback = (
  newTier: TierLevel,
  reason: TierReason,
  prevTier: TierLevel,
) => void;

interface ActiveSignal {
  type: SignalType;
  at: number;
  timeoutMs: number;
}

interface PositionSample {
  lat: number;
  lng: number;
  timestamp: number;
}

interface StationaryAnchor {
  lat: number;
  lng: number;
  /** When we first observed the user near this point. */
  since: number;
}

// ── Tunables ───────────────────────────────────────────────────────────────
//
// MUST stay in sync with the backend:
//   rewp2/src/routes/tracking.ts → INACTIVITY_WINDOW_S (600), INACTIVITY_DISTANCE_M (30)
// The "near destination" radius lives next to the GPS host
// (src/features/monitoring/MonitoringSession.tsx → NEAR_DESTINATION_M, 400 m)
// and matches the backend's INACTIVITY_NEAR_DEST_M.
//
// Signal decay timeouts are client-only — the engine drops a stale signal
// if no fresh one is pushed within this window.

const TIER2_TIMEOUT_MS = 5 * 60 * 1000;
const TIER3_TIMEOUT_MS = 10 * 60 * 1000;

const INACTIVITY_WINDOW_MS = 10 * 60 * 1000; // 10 min sliding window — matches backend
const INACTIVITY_DISTANCE_M = 30;            // <30 m total in window — matches backend
const MIN_SAMPLES_FOR_INACTIVITY = 3;        // need at least N pings to judge

const DECAY_CHECK_INTERVAL_MS = 30_000;      // re-check decay every 30 s

// Signals that put us in the emergency tier directly.
const EMERGENCY_SIGNALS: ReadonlySet<SignalType> = new Set<SignalType>([
  'long_deviation',
  'missed_checkin',
  'user_needs_help',
]);

// ── Service ────────────────────────────────────────────────────────────────

export class TierSignalService {
  private _tier: TierLevel = 1;
  private _reason: TierReason = 'default';
  private _signals = new Map<SignalType, ActiveSignal>();
  private _positions: PositionSample[] = [];
  /**
   * Anchor for the "user has been still here" check. Set when we first
   * see them stationary, reset the moment they wander >30 m from it.
   * Inactivity fires once `now - anchor.since >= INACTIVITY_WINDOW_MS`.
   *
   * This replaces the prior "span of last 10 min of samples" approach,
   * which was mathematically broken — the sliding window's oldest sample
   * keeps getting trimmed, so span can never quite reach 10 min in
   * practice.
   */
  private _stationaryAnchor: StationaryAnchor | null = null;
  private _listeners: TierChangeCallback[] = [];
  private _decayTimer: ReturnType<typeof setInterval>;

  constructor() {
    this._decayTimer = setInterval(() => this._decay(), DECAY_CHECK_INTERVAL_MS);
  }

  /** Subscribe; returns unsubscribe. */
  onTierChange(cb: TierChangeCallback): () => void {
    this._listeners.push(cb);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== cb);
    };
  }

  get currentTier(): TierLevel {
    return this._tier;
  }

  get currentReason(): TierReason {
    return this._reason;
  }

  /**
   * Push a signal from the upstream detector.
   *
   *   short_deviation | inactivity   → Tier 2
   *   long_deviation  | missed_checkin → Tier 3
   *   clear_all → drops to Tier 1 immediately
   */
  pushSignal(type: SignalType): void {
    if (type === 'clear_all') {
      this._signals.clear();
      this._recompute();
      return;
    }

    const timeoutMs = EMERGENCY_SIGNALS.has(type)
      ? TIER3_TIMEOUT_MS
      : TIER2_TIMEOUT_MS;

    this._signals.set(type, { type, at: Date.now(), timeoutMs });
    this._recompute();
  }

  /** Manually clear a single signal (e.g. when deviation resolves). */
  clearSignal(type: SignalType): void {
    if (this._signals.delete(type)) this._recompute();
  }

  /**
   * Feed position from the GPS watcher. Drives the inactivity calculation.
   * `nearDestination` should be true once the user is within ~400 m of the
   * destination they set — the spec says inactivity is suppressed there.
   */
  reportPosition(lat: number, lng: number, nearDestination: boolean): void {
    const now = Date.now();

    // Keep a small recent-positions log for the debug overlay only.
    // The anchor logic below doesn't depend on this list.
    this._positions.push({ lat, lng, timestamp: now });
    const cutoff = now - INACTIVITY_WINDOW_MS;
    this._positions = this._positions.filter((p) => p.timestamp >= cutoff);

    // Anchor-based stationary detection. Cell-tower GPS noise can hop
    // 50–200 m between samples even when truly still, so we treat any
    // sample within INACTIVITY_DISTANCE_M of the anchor as "still here".
    if (!this._stationaryAnchor) {
      this._stationaryAnchor = { lat, lng, since: now };
    } else {
      const distFromAnchor = haversineMeters(
        this._stationaryAnchor.lat,
        this._stationaryAnchor.lng,
        lat,
        lng,
      );
      if (distFromAnchor >= INACTIVITY_DISTANCE_M) {
        // Real movement — reset the anchor to the new position.
        this._stationaryAnchor = { lat, lng, since: now };
        if (this._signals.has('inactivity')) {
          this.clearSignal('inactivity');
        }
        return;
      }
    }

    // Still anchored. If we've been here long enough AND not at the
    // destination, fire inactivity.
    const stationaryMs = now - this._stationaryAnchor.since;
    if (
      stationaryMs >= INACTIVITY_WINDOW_MS &&
      this._positions.length >= MIN_SAMPLES_FOR_INACTIVITY &&
      !nearDestination
    ) {
      // Idempotent: re-pushing refreshes the signal's decay timer.
      this.pushSignal('inactivity');
    } else if (nearDestination && this._signals.has('inactivity')) {
      // Moved into the destination zone — clear it.
      this.clearSignal('inactivity');
    }
  }

  /** Drop everything, fall back to T1. */
  reset(): void {
    this._signals.clear();
    this._positions = [];
    this._stationaryAnchor = null;
    this._recompute();
  }

  /**
   * Internal snapshot for the DEV debug overlay. Lets the UI show why a
   * tier change is or isn't happening in real time without paging through
   * Metro logs.
   */
  getDebugSnapshot(): {
    samples: number;
    spanMs: number;            // recent-positions window span (debug only)
    stationaryMs: number;      // how long since the anchor was set
    distFromAnchorM: number;   // distance from latest sample to anchor
    activeSignals: SignalType[];
    tier: TierLevel;
    reason: TierReason;
  } {
    const samples = this._positions.length;
    const spanMs =
      samples >= 2
        ? this._positions[samples - 1].timestamp - this._positions[0].timestamp
        : 0;

    let stationaryMs = 0;
    let distFromAnchorM = 0;
    if (this._stationaryAnchor) {
      stationaryMs = Date.now() - this._stationaryAnchor.since;
      const last = this._positions[samples - 1];
      if (last) {
        distFromAnchorM = haversineMeters(
          this._stationaryAnchor.lat,
          this._stationaryAnchor.lng,
          last.lat,
          last.lng,
        );
      }
    }
    return {
      samples,
      spanMs,
      stationaryMs,
      distFromAnchorM,
      activeSignals: Array.from(this._signals.keys()),
      tier: this._tier,
      reason: this._reason,
    };
  }

  /** Stop timers + free listeners. Call on session end. */
  destroy(): void {
    clearInterval(this._decayTimer);
    this._listeners = [];
    this._signals.clear();
    this._positions = [];
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _decay(): void {
    const now = Date.now();
    let changed = false;
    for (const [key, sig] of this._signals) {
      if (now - sig.at > sig.timeoutMs) {
        this._signals.delete(key);
        changed = true;
      }
    }
    if (changed) this._recompute();
  }

  private _recompute(): void {
    let target: TierLevel = 1;
    let reason: TierReason = 'default';

    for (const sig of this._signals.values()) {
      if (EMERGENCY_SIGNALS.has(sig.type)) {
        target = 3;
        reason = sig.type;
        break; // T3 is the ceiling
      }
      if (target < 2) {
        target = 2;
        reason = sig.type;
      }
    }

    if (target !== this._tier) {
      const prev = this._tier;
      this._tier = target;
      this._reason = reason;
      for (const l of this._listeners) {
        try {
          l(target, reason, prev);
        } catch {
          // listener errors must not break the engine
        }
      }
    }
  }

  /**
   * Max distance any sample in the window has been from the anchor (oldest
   * sample). Matches backend semantics — robust to GPS noise. A stationary
   * user with jittery cell-tower fixes still produces a small max even when
   * cumulative distance is large.
   */
  private _maxDisplacementFromAnchor(): number {
    if (this._positions.length < 2) return 0;
    const anchor = this._positions[0];
    let max = 0;
    for (let i = 1; i < this._positions.length; i++) {
      const d = haversineMeters(
        anchor.lat,
        anchor.lng,
        this._positions[i].lat,
        this._positions[i].lng,
      );
      if (d > max) max = d;
    }
    return max;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
