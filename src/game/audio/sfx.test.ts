import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installAudioFakes,
  uninstallAudioFakes,
  type AudioFakes
} from "./__tests__/fakeAudio";
import type { sfx as SfxT } from "./sfx";
import type { audioBus as AudioBusT } from "./AudioBus";

// sfx is procedural (Web Audio). The audit-mandated invariant: every play*
// call wires `autoDispose` so on the stopper's `ended` event, the entire
// node chain is disconnected. Without this, in a 3-minute combat the dead
// node count climbs into the thousands and pins the GC.
//
// Mute is now driven by AudioBus; the engine no longer exposes setMuted /
// subscribe directly to UI code. The tests below drive mute through the
// bus to mirror real call sites.

let fakes: AudioFakes;
let sfx: typeof SfxT;
let audioBus: typeof AudioBusT;

beforeEach(async () => {
  fakes = installAudioFakes();
  vi.resetModules();
  ({ audioBus } = await import("./AudioBus"));
  ({ sfx } = await import("./sfx"));
});

afterEach(() => {
  uninstallAudioFakes();
});

// Index 0 of `ctx.gains` is the lazily-created master gain (shared across
// all sounds, never disconnected). Per-sound gains start at index 1.
const PER_SOUND_GAIN_IDX = 1;

describe("sfx autoDispose contract", () => {
  it("laser(): firing the oscillator's onended disconnects osc + per-sound gain", () => {
    sfx.laser();
    const ctx = fakes.context();
    expect(ctx.oscillators).toHaveLength(1);
    // Master gain (index 0) + per-sound gain (index 1).
    expect(ctx.gains).toHaveLength(2);
    const osc = ctx.oscillators[0];
    const gain = ctx.gains[PER_SOUND_GAIN_IDX];
    if (!osc || !gain) throw new Error("missing nodes");
    expect(osc.disconnectCalls).toBe(0);
    expect(gain.disconnectCalls).toBe(0);
    osc.fireEnded();
    expect(osc.disconnectCalls).toBe(1);
    expect(gain.disconnectCalls).toBe(1);
  });

  it("hit(): same disposal contract as laser", () => {
    sfx.hit();
    const ctx = fakes.context();
    const osc = ctx.oscillators[0];
    const gain = ctx.gains[PER_SOUND_GAIN_IDX];
    if (!osc || !gain) throw new Error("missing nodes");
    osc.fireEnded();
    expect(osc.disconnectCalls).toBe(1);
    expect(gain.disconnectCalls).toBe(1);
  });

  it("pickup(): same disposal contract", () => {
    sfx.pickup();
    const ctx = fakes.context();
    const osc = ctx.oscillators[0];
    const gain = ctx.gains[PER_SOUND_GAIN_IDX];
    if (!osc || !gain) throw new Error("missing nodes");
    osc.fireEnded();
    expect(osc.disconnectCalls).toBe(1);
    expect(gain.disconnectCalls).toBe(1);
  });

  it("explosion(): disconnects buffer source + filter + per-sound gain (master gain stays)", () => {
    sfx.explosion();
    const ctx = fakes.context();
    expect(ctx.bufferSources).toHaveLength(1);
    expect(ctx.biquads).toHaveLength(1);
    expect(ctx.gains).toHaveLength(2);
    const src = ctx.bufferSources[0];
    const filter = ctx.biquads[0];
    const gain = ctx.gains[PER_SOUND_GAIN_IDX];
    const master = ctx.gains[0];
    if (!src || !filter || !gain || !master) throw new Error("missing nodes");
    src.fireEnded();
    expect(src.disconnectCalls).toBe(1);
    expect(filter.disconnectCalls).toBe(1);
    expect(gain.disconnectCalls).toBe(1);
    // Master gain is the shared sink — it must NOT be disconnected by a
    // single sound's disposal, otherwise subsequent sounds go silent.
    expect(master.disconnectCalls).toBe(0);
  });

  it("explosion() reuses the noise buffer across calls (no per-shot allocation)", () => {
    sfx.explosion();
    sfx.explosion();
    sfx.explosion();
    const ctx = fakes.context();
    // Buffer is filled once, then cached.
    expect(ctx.buffersCreated).toBe(1);
    expect(ctx.bufferSources).toHaveLength(3);
  });

  it("audioBus master mute makes play* a no-op (no AudioContext is even created)", () => {
    audioBus.setMasterMuted(true);
    sfx.laser();
    sfx.explosion();
    sfx.hit();
    expect(fakes.contexts()).toHaveLength(0);
  });

  it("category mute on sfx alone silences sfx without notifying other categories", () => {
    // Register stand-in engines under voice and music so we can verify the
    // bus's category-scoped fan-out — sfx's category mute must NOT call
    // setMuted on engines registered under other categories.
    const voiceCalls: boolean[] = [];
    const musicCalls: boolean[] = [];
    audioBus.register("voice", { setMuted: (m) => voiceCalls.push(m) });
    audioBus.register("music", { setMuted: (m) => musicCalls.push(m) });
    voiceCalls.length = 0;
    musicCalls.length = 0;
    audioBus.setCategoryMuted("sfx", true);
    sfx.laser();
    expect(fakes.contexts()).toHaveLength(0);
    expect(voiceCalls).toEqual([]);
    expect(musicCalls).toEqual([]);
  });

  it("unmuting after mute lets sounds resume creating nodes and zero the master gain back to 1", () => {
    audioBus.setMasterMuted(true);
    sfx.laser();
    expect(fakes.contexts()).toHaveLength(0);
    audioBus.setMasterMuted(false);
    sfx.laser();
    expect(fakes.contexts()).toHaveLength(1);
    expect(fakes.context().oscillators).toHaveLength(1);
    // Master gain (index 0) is back at 1.0 — audible.
    expect(fakes.context().gains[0]?.gain.value).toBe(1);
  });

  it("muting AFTER a sound has been scheduled flips the master gain to 0", () => {
    sfx.laser();
    const ctx = fakes.context();
    // The master gain is the FIRST gain allocated by ensureCtx, before any
    // per-sound gain. The laser's per-sound gain sits at index 1.
    const master = ctx.gains[0];
    if (!master) throw new Error("master gain missing");
    expect(master.gain.value).toBe(1);
    audioBus.setMasterMuted(true);
    expect(master.gain.value).toBe(0);
  });
});

describe("sfx context lifecycle", () => {
  it("creates a single AudioContext lazily on first sound", () => {
    expect(fakes.contexts()).toHaveLength(0);
    sfx.laser();
    expect(fakes.contexts()).toHaveLength(1);
    sfx.hit();
    sfx.pickup();
    expect(fakes.contexts()).toHaveLength(1);
  });

  it("calls resume() if the context starts suspended", () => {
    sfx.laser();
    const ctx = fakes.context();
    // Our fake starts in 'running' — flip to suspended and trigger another
    // sound to exercise the resume() call path.
    ctx.state = "suspended";
    sfx.hit();
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.state).toBe("running");
  });
});
