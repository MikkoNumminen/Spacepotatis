import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installAudioFakes,
  uninstallAudioFakes,
  type AudioFakes
} from "./__tests__/fakeAudio";
import type { sfx as SfxT } from "./sfx";

// sfx is procedural (Web Audio). The audit-mandated invariant: every play*
// call wires `autoDispose` so on the stopper's `ended` event, the entire
// node chain is disconnected. Without this, in a 3-minute combat the dead
// node count climbs into the thousands and pins the GC.

let fakes: AudioFakes;
let sfx: typeof SfxT;

beforeEach(async () => {
  fakes = installAudioFakes();
  vi.resetModules();
  ({ sfx } = await import("./sfx"));
});

afterEach(() => {
  uninstallAudioFakes();
});

describe("sfx autoDispose contract", () => {
  it("laser(): firing the oscillator's onended disconnects osc + gain", () => {
    sfx.laser();
    const ctx = fakes.context();
    expect(ctx.oscillators).toHaveLength(1);
    expect(ctx.gains).toHaveLength(1);
    const osc = ctx.oscillators[0];
    const gain = ctx.gains[0];
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
    const gain = ctx.gains[0];
    if (!osc || !gain) throw new Error("missing nodes");
    osc.fireEnded();
    expect(osc.disconnectCalls).toBe(1);
    expect(gain.disconnectCalls).toBe(1);
  });

  it("pickup(): same disposal contract", () => {
    sfx.pickup();
    const ctx = fakes.context();
    const osc = ctx.oscillators[0];
    const gain = ctx.gains[0];
    if (!osc || !gain) throw new Error("missing nodes");
    osc.fireEnded();
    expect(osc.disconnectCalls).toBe(1);
    expect(gain.disconnectCalls).toBe(1);
  });

  it("explosion(): disconnects buffer source + filter + gain", () => {
    sfx.explosion();
    const ctx = fakes.context();
    expect(ctx.bufferSources).toHaveLength(1);
    expect(ctx.biquads).toHaveLength(1);
    expect(ctx.gains).toHaveLength(1);
    const src = ctx.bufferSources[0];
    const filter = ctx.biquads[0];
    const gain = ctx.gains[0];
    if (!src || !filter || !gain) throw new Error("missing nodes");
    src.fireEnded();
    expect(src.disconnectCalls).toBe(1);
    expect(filter.disconnectCalls).toBe(1);
    expect(gain.disconnectCalls).toBe(1);
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

  it("setMuted(true) makes play* a no-op (no AudioContext is even created)", () => {
    // Reset to a state with no context yet.
    sfx.setMuted(true);
    sfx.laser();
    sfx.explosion();
    sfx.hit();
    expect(fakes.contexts()).toHaveLength(0);
  });

  it("setMuted(false) after setMuted(true) lets sounds resume creating nodes", () => {
    sfx.setMuted(true);
    sfx.laser();
    expect(fakes.contexts()).toHaveLength(0);
    sfx.setMuted(false);
    sfx.laser();
    expect(fakes.contexts()).toHaveLength(1);
    expect(fakes.context().oscillators).toHaveLength(1);
  });

  it("subscribe() notifies on mute changes and unsubscribes cleanly", () => {
    const calls: boolean[] = [];
    const off = sfx.subscribe((m) => calls.push(m));
    sfx.setMuted(true);
    sfx.setMuted(false);
    off();
    sfx.setMuted(true);
    expect(calls).toEqual([true, false]);
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
