import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioBusEngine, audioBus as AudioBusT } from "./AudioBus";

// AudioBus is pure logic — no DOM or browser APIs touched. Tests just
// register fake engines and assert that mute changes propagate per category
// and that the diff path skips redundant setMuted calls.

class FakeEngine implements AudioBusEngine {
  muteCalls: boolean[] = [];
  setMuted(muted: boolean): void {
    this.muteCalls.push(muted);
  }
}

let audioBus: typeof AudioBusT;

beforeEach(async () => {
  vi.resetModules();
  ({ audioBus } = await import("./AudioBus"));
});

afterEach(() => {
  vi.resetModules();
});

describe("AudioBus.register", () => {
  it("synchronously seeds the engine with the current effective mute", () => {
    audioBus.setMasterMuted(true);
    const eng = new FakeEngine();
    audioBus.register("music", eng);
    expect(eng.muteCalls).toEqual([true]);
  });

  it("returns an unregister fn that detaches the engine", () => {
    const eng = new FakeEngine();
    const off = audioBus.register("music", eng);
    eng.muteCalls = [];
    audioBus.setMasterMuted(true);
    expect(eng.muteCalls).toEqual([true]);
    off();
    audioBus.setMasterMuted(false);
    expect(eng.muteCalls).toEqual([true]);
  });

  it("unregister is idempotent — calling it twice doesn't throw", () => {
    const eng = new FakeEngine();
    const off = audioBus.register("music", eng);
    off();
    expect(() => off()).not.toThrow();
    // And subsequent state changes still don't notify the doubly-detached engine.
    eng.muteCalls = [];
    audioBus.setMasterMuted(true);
    expect(eng.muteCalls).toEqual([]);
  });
});

describe("AudioBus.setMasterMuted", () => {
  it("fans out to every registered engine in every category", () => {
    const m = new FakeEngine();
    const v = new FakeEngine();
    const s = new FakeEngine();
    audioBus.register("music", m);
    audioBus.register("voice", v);
    audioBus.register("sfx", s);
    m.muteCalls = [];
    v.muteCalls = [];
    s.muteCalls = [];
    audioBus.setMasterMuted(true);
    expect(m.muteCalls).toEqual([true]);
    expect(v.muteCalls).toEqual([true]);
    expect(s.muteCalls).toEqual([true]);
  });

  it("is a no-op when the value doesn't change", () => {
    const m = new FakeEngine();
    audioBus.register("music", m);
    m.muteCalls = [];
    audioBus.setMasterMuted(false);
    expect(m.muteCalls).toEqual([]);
  });
});

describe("AudioBus.setCategoryMuted", () => {
  it("only notifies engines in the affected category", () => {
    const m = new FakeEngine();
    const v = new FakeEngine();
    const s = new FakeEngine();
    audioBus.register("music", m);
    audioBus.register("voice", v);
    audioBus.register("sfx", s);
    m.muteCalls = [];
    v.muteCalls = [];
    s.muteCalls = [];
    audioBus.setCategoryMuted("voice", true);
    expect(m.muteCalls).toEqual([]);
    expect(v.muteCalls).toEqual([true]);
    expect(s.muteCalls).toEqual([]);
  });

  it("does NOT redundantly notify when master is already muting the category", () => {
    const m = new FakeEngine();
    audioBus.register("music", m);
    audioBus.setMasterMuted(true);
    m.muteCalls = [];
    // Master is already silencing music; flipping the category mute on doesn't
    // change the effective state, so no setMuted call should land.
    audioBus.setCategoryMuted("music", true);
    expect(m.muteCalls).toEqual([]);
  });

  it("does NOT notify when toggling master while a category is already muted", () => {
    const m = new FakeEngine();
    audioBus.register("music", m);
    audioBus.setCategoryMuted("music", true);
    m.muteCalls = [];
    // Master flips on but music was already category-muted, so the engine
    // stays muted — effective state unchanged, no call.
    audioBus.setMasterMuted(true);
    expect(m.muteCalls).toEqual([]);
    // Master off again: still muted via category, no call (mirror of the
    // master-on case — pinned because both directions exercise applyDiff's
    // "skip when before === after" branch).
    audioBus.setMasterMuted(false);
    expect(m.muteCalls).toEqual([]);
  });

  it("master OFF while category is also OFF unmutes only categories that flip", () => {
    const m = new FakeEngine();
    const v = new FakeEngine();
    audioBus.register("music", m);
    audioBus.register("voice", v);
    audioBus.setCategoryMuted("voice", true); // voice now muted
    audioBus.setMasterMuted(true); // both muted
    m.muteCalls = [];
    v.muteCalls = [];
    audioBus.setMasterMuted(false);
    // Music unmutes (master was the only thing muting it).
    expect(m.muteCalls).toEqual([false]);
    // Voice stays muted (category mute still on); no redundant call.
    expect(v.muteCalls).toEqual([]);
  });
});

describe("AudioBus.subscribe", () => {
  it("delivers initial state synchronously and on every change", () => {
    const seen: Array<{ master: boolean; music: boolean }> = [];
    const off = audioBus.subscribe((s) =>
      seen.push({ master: s.masterMuted, music: s.muted.music })
    );
    audioBus.setMasterMuted(true);
    audioBus.setCategoryMuted("music", true);
    off();
    audioBus.setMasterMuted(false);
    expect(seen).toEqual([
      { master: false, music: false },
      { master: true, music: false },
      { master: true, music: true }
    ]);
  });
});

describe("AudioBus.isMuted", () => {
  it("returns true when master is on", () => {
    audioBus.setMasterMuted(true);
    expect(audioBus.isMuted("music")).toBe(true);
    expect(audioBus.isMuted("voice")).toBe(true);
    expect(audioBus.isMuted("sfx")).toBe(true);
  });

  it("returns true for the matching category and false for others", () => {
    audioBus.setCategoryMuted("voice", true);
    expect(audioBus.isMuted("music")).toBe(false);
    expect(audioBus.isMuted("voice")).toBe(true);
    expect(audioBus.isMuted("sfx")).toBe(false);
  });
});
