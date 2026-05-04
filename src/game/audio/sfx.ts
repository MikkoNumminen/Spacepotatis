"use client";

import { audioBus } from "./AudioBus";

// PUBLIC API — this engine is part of the `audio` module's contract.
//   Stable. Breaking changes require a coordinated update of every caller.
//   See ./README.md for the rationale.
//
// Procedural sound effects via Web Audio. No asset files — keeps the build
// small and avoids a loader step for placeholder audio. Swap for real samples
// later by rewriting the `play*` methods to trigger HTMLAudioElement playback.
//
// Mute state is owned by AudioBus (category: sfx). When sfx is muted the
// master GainNode is set to 0 so any in-flight sounds go silent immediately
// without abandoning their schedules. `ensureCtx()` also early-outs while
// muted so a context isn't created for sounds that are about to be silenced
// — avoids spinning up the AudioContext until it's actually needed.
//
// INVARIANT — disposal + sink contract:
//   1. Every play* call schedules ONE stopper (oscillator or buffer source)
//      and pipes through `masterGain → ctx.destination`.
//   2. Every chain MUST terminate at `this.sink` (the shared master GainNode
//      returned by ensureCtx), NOT `ctx.destination` directly. That's how
//      setMuted(true) silences in-flight sounds in one assignment.
//   3. Every play* call MUST end with `autoDispose(stopper, ...rest)`. Web
//      Audio nodes that remain connect()-ed are GC-pinned even after they
//      stopped producing sound — in a 3-minute combat with ~30 lasers/s
//      plus explosions and hits, that adds up to thousands of detached-
//      but-pinned nodes by mission end.
//
// AI-NOTE: when adding a new play* method, copy the existing pattern:
//   const sc = this.ensureCtx(); if (!sc) return;
//   const { ctx, sink } = sc;
//   ...build chain...; chain.connect(sink);
//   stopper.start(t); stopper.stop(t + duration);
//   autoDispose(stopper, ...allOtherNodesExceptSink);
// Then add a unit test that asserts disconnectCalls === 1 on every node.

// INTERNAL
// Disconnect every node when the (single) stopper finishes. Call AFTER all
// connect() and start() calls so the chain is fully built.
function autoDispose(stopper: AudioScheduledSourceNode, ...rest: AudioNode[]): void {
  stopper.onended = () => {
    stopper.disconnect();
    for (const n of rest) n.disconnect();
  };
}

// Time constant for master-gain mute transitions. ~5ms is short enough that
// the silence feels instant but long enough to avoid the click that an
// abrupt `gain.value =` produces on some browsers when a sound is mid-envelope.
const MUTE_RAMP_TC = 0.005;

// INTERNAL
interface SoundContext {
  readonly ctx: AudioContext;
  readonly sink: AudioNode;
}

// INTERNAL — exposed only via the `sfx` singleton at file end.
class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  // Reusable white-noise buffer for explosion(). Filled lazily on first
  // explosion; reused for every subsequent call. The buffer's contents
  // (white noise) don't need to vary per shot — the lowpass-fade envelope
  // and per-call gain already make each explosion sound distinct.
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    audioBus.register("sfx", this);
  }

  // INTERNAL
  // Returns the live AudioContext + the shared masterGain that every per-sound
  // chain terminates at, or null if we shouldn't be making sound right now
  // (SSR, muted, or no Web Audio support). Bundling them avoids a separate
  // `sink` getter that would have to re-prove `masterGain != null` past the
  // type system.
  private ensureCtx(): SoundContext | null {
    if (typeof window === "undefined") return null;
    if (audioBus.isMuted("sfx")) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      const masterGain = ctx.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(ctx.destination);
      this.ctx = ctx;
      this.masterGain = masterGain;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    // Non-null assertions are safe: masterGain is always set in lockstep
    // with ctx above, and only here.
    return { ctx: this.ctx, sink: this.masterGain as GainNode };
  }

  // INTERNAL
  // Filled once on first call; if the AudioContext sample rate ever changes
  // (rare — e.g. context recreated after a teardown) we regenerate.
  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  /**
   * AudioBus callback. Drops in-flight sounds to silence immediately by
   * ramping the master gain to 0 (with ~5ms time constant to avoid the
   * click an abrupt `gain.value =` can produce mid-envelope). The per-sound
   * envelopes keep running under the silenced master and dispose normally
   * via `autoDispose` on `stopper.onended`.
   *
   * @stable
   */
  setMuted(muted: boolean): void {
    // Drop any in-flight sounds to silence immediately, with a short ramp to
    // avoid the click an abrupt `gain.value =` can produce mid-envelope. The
    // play* paths still schedule their own envelopes; leaving those running
    // under a 0-master is fine because disposal fires on stopper.onended.
    const gain = this.masterGain;
    const ctx = this.ctx;
    if (gain && ctx) {
      gain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, MUTE_RAMP_TC);
    }
  }

  // ---- sounds --------------------------------------------------------

  /**
   * Player + enemy weapon fire. Square-wave chirp from 880 → 220 Hz over
   * 80ms with a 100ms exponential decay. Cheap to schedule; safe to fire
   * 30+ times per second.
   *
   * @stable
   */
  laser(): void {
    const sc = this.ensureCtx();
    if (!sc) return;
    const { ctx, sink } = sc;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.08);
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(sink);
    osc.start(t);
    osc.stop(t + 0.12);
    autoDispose(osc, gain);
  }

  /**
   * Enemy / pickup destruction sound. White-noise burst through a lowpass
   * filter that sweeps 1400 → 120 Hz over 300ms, with a matching gain
   * envelope fading to silence. Reuses a shared white-noise buffer (see
   * `getNoiseBuffer`) — the per-call envelope already makes each shot
   * distinct.
   *
   * @stable
   */
  explosion(): void {
    const sc = this.ensureCtx();
    if (!sc) return;
    const { ctx, sink } = sc;
    const t = ctx.currentTime;

    // White-noise burst through a lowpass filter. Buffer is shared across
    // calls — see getNoiseBuffer above.
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(filter).connect(gain).connect(sink);
    src.start(t);
    src.stop(t + 0.4);
    autoDispose(src, filter, gain);
  }

  /**
   * Bullet-on-armor / shield-glance feedback. Triangle-wave thud from
   * 180 → 60 Hz over 80ms. Lower-pitched than `laser` so it reads as a
   * collision rather than a fire.
   *
   * @stable
   */
  hit(): void {
    const sc = this.ensureCtx();
    if (!sc) return;
    const { ctx, sink } = sc;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(sink);
    osc.start(t);
    osc.stop(t + 0.12);
    autoDispose(osc, gain);
  }

  /**
   * Drop-pickup chime. Sine-wave sweep from 660 → 1320 Hz over 120ms — an
   * upward octave to read as "you got something good".
   *
   * @stable
   */
  pickup(): void {
    const sc = this.ensureCtx();
    if (!sc) return;
    const { ctx, sink } = sc;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(sink);
    osc.start(t);
    osc.stop(t + 0.18);
    autoDispose(osc, gain);
  }
}

/**
 * Procedural Web Audio combat SFX. Owns the shared `AudioContext` and the
 * master `GainNode` that every per-sound chain terminates at, so muting
 * sets a single gain to zero rather than tracking per-sound nodes.
 * Registered with the bus as `sfx`.
 *
 * INVARIANT: every chain MUST terminate at the master gain (`this.sink`),
 * NOT at `ctx.destination`. Every play* MUST call `autoDispose` so nodes
 * disconnect on `ended`. See ./README.md.
 *
 * @stable
 */
export const sfx = new SoundEngine();
