"use client";

import { audioBus } from "./AudioBus";

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
// Disposal contract: every play* call schedules a stopper (oscillator or
// buffer source) and pipes through `masterGain → ctx.destination`. Web
// Audio nodes that remain `connect()`-ed are GC-pinned even after they've
// stopped producing sound — in a 3-minute combat with ~30 lasers/s plus
// explosions and hits, that adds up to thousands of detached-but-pinned
// nodes by mission end. `autoDispose` wires `onended` on the stopper to
// disconnect every node in the chain so the GC can reclaim them promptly.
// (The master gain is shared across all sounds and never disconnected.)

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

interface SoundContext {
  readonly ctx: AudioContext;
  readonly sink: AudioNode;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  // Reusable white-noise buffer for explosion(). Filled lazily on first
  // explosion; reused for every subsequent call. The buffer's contents
  // (white noise) don't need to vary per shot — the lowpass-fade envelope
  // and per-call gain already make each explosion sound distinct.
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    audioBus.register("sfx", this);
  }

  // Returns the live AudioContext + the shared masterGain that every per-sound
  // chain terminates at, or null if we shouldn't be making sound right now
  // (SSR, muted, or no Web Audio support). Bundling them avoids a separate
  // `sink` getter that would have to re-prove `masterGain != null` past the
  // type system.
  private ensureCtx(): SoundContext | null {
    if (typeof window === "undefined") return null;
    if (this.muted) return null;
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

  setMuted(muted: boolean): void {
    this.muted = muted;
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

export const sfx = new SoundEngine();
