/**
 * Stub signal source — pretends to be the upstream "other service" that
 * detects route deviations and missed check-ins.
 *
 * Why this file exists:
 *   The real detector (route-deviation engine, check-in scheduler, etc.) is
 *   either backend-only or not yet built. This stub produces the same
 *   *output shape* that the real service would push, so TierSignalService
 *   can be developed and demoed in isolation. When the real service comes
 *   online, swap this for an adapter that pipes its events into
 *   `tier.pushSignal(...)` and delete this file.
 *
 * It's framework-agnostic: just emits signals at a configurable schedule.
 * Hand it a TierSignalService and it will drive it.
 */

import type { SignalType, TierSignalService } from './tierSignal';

export interface StubSignalSourceOptions {
  /**
   * Emit a signal every `intervalMs` milliseconds, cycling through
   * `cycle`. After the last entry, it wraps. Set `intervalMs: 0` to
   * disable auto-emission (manual `emit()` only).
   */
  intervalMs?: number;
  cycle?: SignalType[];
  /**
   * Called every time a signal is emitted. Useful for logging during
   * demos so you can correlate UI changes with the source event.
   */
  onEmit?: (type: SignalType, index: number) => void;
}

const DEFAULT_CYCLE: SignalType[] = [
  'short_deviation',  // → T2
  'inactivity',       // → T2 (decays at 5 min — but we re-push)
  'long_deviation',   // → T3
  'clear_all',        // → back to T1
  'missed_checkin',   // → T3
  'clear_all',        // → back to T1
];

export class StubSignalSource {
  private _tier: TierSignalService;
  private _opts: Required<StubSignalSourceOptions>;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _cursor = 0;

  constructor(tier: TierSignalService, opts: StubSignalSourceOptions = {}) {
    this._tier = tier;
    this._opts = {
      intervalMs: opts.intervalMs ?? 30_000, // every 30s for a quick demo
      cycle: opts.cycle ?? DEFAULT_CYCLE,
      onEmit: opts.onEmit ?? (() => {}),
    };
  }

  /** Begin auto-emission. No-op if intervalMs <= 0. */
  start(): void {
    if (this._timer || this._opts.intervalMs <= 0) return;
    this._timer = setInterval(() => this._fire(), this._opts.intervalMs);
  }

  /** Stop auto-emission. Manual `emit()` still works. */
  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** Manually push a signal — useful for dev menu buttons. */
  emit(type: SignalType): void {
    this._opts.onEmit(type, -1);
    this._tier.pushSignal(type);
  }

  /** Tear down. */
  destroy(): void {
    this.stop();
  }

  private _fire(): void {
    const type = this._opts.cycle[this._cursor % this._opts.cycle.length];
    this._opts.onEmit(type, this._cursor);
    this._tier.pushSignal(type);
    this._cursor += 1;
  }
}
