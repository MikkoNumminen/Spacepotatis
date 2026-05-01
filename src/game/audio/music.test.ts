import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installAudioFakes,
  uninstallAudioFakes,
  flushMicrotasks,
  type AudioFakes
} from "./__tests__/fakeAudio";
import type { menuMusic as MenuMusicT, combatMusic as CombatMusicT } from "./music";

// MusicEngine is a stateful, retry-driven thing. The tests below pin the
// contracts that other engines (and the upcoming AudioBus refactor) will
// rely on:
//  - `arm()` is a no-op until a src is bound; binding via `loadTrack()`
//    auto-arms and starts playback.
//  - `setMuted(true)` fades to 0; for a keepAlive engine the element
//    keeps playing at volume 0, never paused.
//  - `duck()` / `unduck()` is reversible — interleaving with mute does the
//    intuitive thing (still silent if either flag is on).
//  - `stop()` releases the element on non-loop engines; loop engines just
//    pause so the next arm reuses the same element.
//  - The watchdog + retry layer kicks startPlayback() when the element is
//    paused but should be playing — guarantees self-healing within ~2s.

let fakes: AudioFakes;
let menuMusic: typeof MenuMusicT;
let combatMusic: typeof CombatMusicT;

beforeEach(async () => {
  fakes = installAudioFakes();
  vi.resetModules();
  ({ menuMusic, combatMusic } = await import("./music"));
});

afterEach(() => {
  uninstallAudioFakes();
});

describe("menuMusic (keepAlive + native loop)", () => {
  it("init() creates a single Audio element with src bound and loop=true", () => {
    menuMusic.init();
    expect(fakes.audios()).toHaveLength(1);
    const el = fakes.audio();
    expect(el.src).toBe("/audio/music/menu-theme.ogg");
    expect(el.loop).toBe(true);
    expect(el.preload).toBe("auto");
    // Before arm, no play() yet.
    expect(el.playCalls).toBe(0);
  });

  it("arm() fires play() exactly once and starts the volume fade", async () => {
    menuMusic.init();
    menuMusic.arm();
    await flushMicrotasks();
    const el = fakes.audio();
    expect(el.playCalls).toBe(1);
    expect(el.paused).toBe(false);
    // arm is idempotent — second call must not re-trigger play.
    menuMusic.arm();
    await flushMicrotasks();
    expect(el.playCalls).toBe(1);
  });

  it("setMuted(true) fades to 0 but does NOT pause (keepAlive)", async () => {
    menuMusic.init();
    menuMusic.arm();
    await flushMicrotasks();
    const el = fakes.audio();
    const playsBefore = el.playCalls;
    menuMusic.setMuted(true);
    // Drive the rAF-based fade past the fade-out duration (4s default).
    vi.advanceTimersByTime(5000);
    expect(el.volume).toBe(0);
    expect(el.paused).toBe(false);
    expect(el.pauseCalls).toBe(0);
    // Unmute should NOT spawn a second play() — the element was never paused.
    menuMusic.setMuted(false);
    vi.advanceTimersByTime(3000);
    expect(el.playCalls).toBe(playsBefore);
  });

  it("duck() then unduck() leaves the element playing throughout", async () => {
    menuMusic.init();
    menuMusic.arm();
    await flushMicrotasks();
    const el = fakes.audio();
    menuMusic.duck();
    vi.advanceTimersByTime(5000);
    expect(el.paused).toBe(false);
    expect(el.volume).toBe(0);
    menuMusic.unduck();
    vi.advanceTimersByTime(3000);
    expect(el.volume).toBeGreaterThan(0);
  });
});

describe("combatMusic (manual loop, releases on stop)", () => {
  it("loadTrack(src) attaches an element, auto-arms, and starts playback", async () => {
    combatMusic.loadTrack("/audio/music/combat-1.ogg");
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    const el = fakes.audio();
    expect(el.src).toBe("/audio/music/combat-1.ogg");
    expect(el.loop).toBe(false);
    expect(el.playCalls).toBe(1);
    expect(el.paused).toBe(false);
  });

  it("loadTrack(null) tears the playback down without releasing the element", async () => {
    combatMusic.loadTrack("/audio/music/combat-1.ogg");
    await flushMicrotasks();
    const el = fakes.audio();
    combatMusic.loadTrack(null);
    expect(el.pauseCalls).toBeGreaterThan(0);
    expect(el.paused).toBe(true);
  });

  it("loadTrack swaps the src in place when the element already exists", async () => {
    combatMusic.loadTrack("/audio/music/a.ogg");
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    const elBefore = fakes.audio();
    combatMusic.loadTrack("/audio/music/b.ogg");
    await flushMicrotasks();
    // Same element, src swapped — not a fresh allocation.
    expect(fakes.audios()).toHaveLength(1);
    expect(elBefore.src).toBe("/audio/music/b.ogg");
    // playCalls bumps because startPlayback is invoked again.
    expect(elBefore.playCalls).toBe(2);
  });

  it("stop() fades out and releases the element so it doesn't count against iOS budget", async () => {
    combatMusic.loadTrack("/audio/music/combat-1.ogg");
    await flushMicrotasks();
    const el = fakes.audio();
    combatMusic.stop();
    // Drive the fade-out past its 4s default.
    vi.advanceTimersByTime(5000);
    expect(el.paused).toBe(true);
    // After stop, src is cleared (load() called).
    expect(el.src).toBe("");
    expect(el.loadCalls).toBeGreaterThan(0);
  });

  it("on natural end, schedules a silence then restarts playback (manual loop seam)", async () => {
    combatMusic.loadTrack("/audio/music/combat-1.ogg");
    await flushMicrotasks();
    const el = fakes.audio();
    const playsBefore = el.playCalls;
    el.fireEnded();
    // SILENCE_MS = 800. Anything before that should NOT have re-played.
    vi.advanceTimersByTime(700);
    expect(el.playCalls).toBe(playsBefore);
    vi.advanceTimersByTime(200);
    await flushMicrotasks();
    expect(el.playCalls).toBe(playsBefore + 1);
  });

  it("setMuted(true) pauses the (non-keepAlive) element after the fade resolves", async () => {
    combatMusic.loadTrack("/audio/music/combat-1.ogg");
    await flushMicrotasks();
    const el = fakes.audio();
    combatMusic.setMuted(true);
    vi.advanceTimersByTime(5000);
    expect(el.paused).toBe(true);
    combatMusic.setMuted(false);
    await flushMicrotasks();
    expect(el.paused).toBe(false);
  });
});

describe("watchdog + retry self-healing", () => {
  it("retries play() ~250ms after the first call rejects (autoplay block)", async () => {
    fakes.setNextPlayBehavior("reject");
    combatMusic.loadTrack("/audio/music/combat-1.ogg");
    await flushMicrotasks();
    const el = fakes.audio();
    expect(el.playCalls).toBe(1);
    // After the rejection, retry timer is armed.
    fakes.setNextPlayBehavior("resolve");
    vi.advanceTimersByTime(300);
    await flushMicrotasks();
    expect(el.playCalls).toBeGreaterThanOrEqual(2);
    expect(el.paused).toBe(false);
  });

  it("watchdog kicks startPlayback() when shouldBePlaying but element is paused", async () => {
    combatMusic.loadTrack("/audio/music/combat-1.ogg");
    await flushMicrotasks();
    const el = fakes.audio();
    const playsBefore = el.playCalls;
    // Simulate an external pause that the engine didn't initiate (e.g., OS
    // audio session interrupt). The pause handler schedules a retry; if the
    // retry doesn't take, the watchdog (~2s) backs it up.
    fakes.setNextPlayBehavior("reject");
    el.paused = true;
    fakes.setNextPlayBehavior("resolve");
    // Watchdog fires every 2000ms.
    vi.advanceTimersByTime(2100);
    await flushMicrotasks();
    expect(el.playCalls).toBeGreaterThan(playsBefore);
  });
});
