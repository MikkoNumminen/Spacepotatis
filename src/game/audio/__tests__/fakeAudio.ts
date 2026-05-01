import { vi } from "vitest";

// Hand-rolled fakes for the browser audio surface the engines touch:
// HTMLAudioElement (constructor `Audio`), AudioContext (Web Audio), and the
// `window`/`document` globals the engines guard against during SSR.
//
// Why a hand-rolled fake rather than jsdom: jsdom would add a runtime
// dependency, double test boot time, and still wouldn't ship a working
// `play()` (jsdom stubs HTMLMediaElement methods to throw "not implemented").
// We need control over the play() promise (autoplay-block simulation),
// and we want introspection — `audio.playCalls`, `osc.disconnectCalls`,
// etc. — that a real DOM doesn't expose.
//
// Usage:
//   import { installAudioFakes, uninstallAudioFakes } from "./fakeAudio";
//   let fakes: AudioFakes;
//   beforeEach(() => { fakes = installAudioFakes(); });
//   afterEach(() => { uninstallAudioFakes(); });
//
// Then `await import("../music")` *after* install so the singletons are
// born under the fakes. Vitest's `vi.resetModules()` (called by uninstall)
// guarantees the next test gets fresh singletons.

type Listener = (ev?: { type: string }) => void;

let liveAudios: FakeAudio[] = [];
let liveContexts: FakeAudioContext[] = [];
let nextPlayBehavior: "resolve" | "reject" = "resolve";

export class FakeAudio {
  src: string;
  loop = false;
  volume = 0;
  preload = "";
  paused = true;
  ended = false;
  currentTime = 0;
  // duration is NaN until tests set it (matches browser before metadata loads).
  duration = Number.NaN;

  // Test-side counters / state.
  playCalls = 0;
  pauseCalls = 0;
  loadCalls = 0;

  private listeners = new Map<string, Set<Listener>>();

  constructor(src?: string) {
    this.src = src ?? "";
    liveAudios.push(this);
  }

  addEventListener(type: string, fn: Listener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }

  removeAttribute(name: string): void {
    // Mirrors the browser: removing the "src" attribute empties the source.
    // music.ts relies on this in `loadTrack(null)` to fully detach the
    // element; without modeling it the fake would lie about the post-state.
    if (name === "src") this.src = "";
  }

  load(): void {
    this.loadCalls += 1;
  }

  play(): Promise<void> {
    this.playCalls += 1;
    if (nextPlayBehavior === "reject") {
      return Promise.reject(new Error("autoplay blocked (fake)"));
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
    if (this.paused) return;
    this.paused = true;
    this.dispatch("pause");
  }

  // Test helpers — not part of the real DOM surface.
  fireEnded(): void {
    this.ended = true;
    this.paused = true;
    this.dispatch("ended");
  }

  fireError(): void {
    this.dispatch("error");
  }

  fireLoadedMetadata(duration: number): void {
    this.duration = duration;
    this.dispatch("loadedmetadata");
  }

  private dispatch(type: string): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) fn({ type });
  }
}

class FakeAudioParam {
  value = 0;
  setValueAtTime(_v: number, _t: number): void {}
  exponentialRampToValueAtTime(_v: number, _t: number): void {}
  linearRampToValueAtTime(_v: number, _t: number): void {}
}

class FakeAudioNode {
  // Connection bookkeeping — tests assert disconnect was called by checking
  // `disconnectCalls`. We don't model the audio graph topology beyond that.
  disconnectCalls = 0;
  connect<T extends FakeAudioNode>(target: T): T {
    return target;
  }
  disconnect(): void {
    this.disconnectCalls += 1;
  }
}

export class FakeOscillator extends FakeAudioNode {
  type = "sine";
  frequency = new FakeAudioParam();
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  start(t = 0): void {
    this.startedAt = t;
  }
  stop(t = 0): void {
    this.stoppedAt = t;
  }
  fireEnded(): void {
    this.onended?.();
  }
}

export class FakeBufferSource extends FakeAudioNode {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  start(t = 0): void {
    this.startedAt = t;
  }
  stop(t = 0): void {
    this.stoppedAt = t;
  }
  fireEnded(): void {
    this.onended?.();
  }
}

export class FakeGain extends FakeAudioNode {
  gain = new FakeAudioParam();
}

export class FakeBiquad extends FakeAudioNode {
  type = "lowpass";
  frequency = new FakeAudioParam();
}

interface FakeBuffer {
  readonly sampleRate: number;
  readonly length: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export class FakeAudioContext {
  state: "suspended" | "running" | "closed" = "running";
  sampleRate = 44100;
  currentTime = 0;
  destination = new FakeAudioNode();
  resumeCalls = 0;

  oscillators: FakeOscillator[] = [];
  bufferSources: FakeBufferSource[] = [];
  gains: FakeGain[] = [];
  biquads: FakeBiquad[] = [];
  buffersCreated = 0;

  constructor() {
    liveContexts.push(this);
  }

  createOscillator(): FakeOscillator {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }
  createBufferSource(): FakeBufferSource {
    const s = new FakeBufferSource();
    this.bufferSources.push(s);
    return s;
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBiquadFilter(): FakeBiquad {
    const f = new FakeBiquad();
    this.biquads.push(f);
    return f;
  }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    this.buffersCreated += 1;
    return {
      sampleRate,
      length,
      numberOfChannels: channels,
      getChannelData: () => new Float32Array(length)
    };
  }
  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
    return Promise.resolve();
  }
}

export interface FakeDocument {
  visibilityState: "visible" | "hidden";
  fireVisibilityChange(): void;
}

interface MutableDocument {
  visibilityState: "visible" | "hidden";
  _listeners: Map<string, Set<Listener>>;
  addEventListener(type: string, fn: Listener): void;
  removeEventListener(type: string, fn: Listener): void;
}

export interface AudioFakes {
  audios(): readonly FakeAudio[];
  audio(idx?: number): FakeAudio;
  contexts(): readonly FakeAudioContext[];
  context(idx?: number): FakeAudioContext;
  setNextPlayBehavior(b: "resolve" | "reject"): void;
  document: FakeDocument;
}

export function installAudioFakes(): AudioFakes {
  liveAudios = [];
  liveContexts = [];
  nextPlayBehavior = "resolve";

  // Engines guard with `typeof window === "undefined"`. Pointing window at
  // globalThis makes those guards pass without dragging in jsdom; the
  // engines also call `window.setTimeout` / `window.setInterval` /
  // `window.clearTimeout`, which already live on the node global.
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.window) g.window = globalThis;

  // Hand-rolled document. Music engine attaches a `visibilitychange` listener
  // and reads `document.visibilityState`; nothing else.
  const doc: MutableDocument = {
    visibilityState: "visible",
    _listeners: new Map(),
    addEventListener(type, fn) {
      let s = this._listeners.get(type);
      if (!s) {
        s = new Set();
        this._listeners.set(type, s);
      }
      s.add(fn);
    },
    removeEventListener(type, fn) {
      this._listeners.get(type)?.delete(fn);
    }
  };
  g.document = doc;

  // Node 24 doesn't ship `requestAnimationFrame` on the global, so vitest
  // can't patch what isn't there. Back rAF/cAF with setTimeout (which IS
  // faked) so the engines' rAF-driven fades advance under `advanceTimersByTime`.
  // `performance` IS on the node global, so that one stays in toFake.
  type RafCallback = (t: number) => void;
  g.requestAnimationFrame = ((cb: RafCallback): number => {
    return globalThis.setTimeout(() => cb(performance.now()), 16) as unknown as number;
  }) as unknown as typeof requestAnimationFrame;
  g.cancelAnimationFrame = ((h: number): void => {
    globalThis.clearTimeout(h);
  }) as unknown as typeof cancelAnimationFrame;

  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "performance",
      "Date"
    ]
  });

  g.Audio = FakeAudio;
  g.AudioContext = FakeAudioContext;

  const fakeDoc: FakeDocument = {
    get visibilityState() {
      return doc.visibilityState;
    },
    set visibilityState(v) {
      doc.visibilityState = v;
    },
    fireVisibilityChange() {
      const set = doc._listeners.get("visibilitychange");
      if (!set) return;
      for (const fn of [...set]) fn({ type: "visibilitychange" });
    }
  };

  return {
    audios: () => liveAudios,
    audio(idx = 0) {
      const a = liveAudios[idx];
      if (!a) {
        throw new Error(`No FakeAudio at idx ${idx} (have ${liveAudios.length})`);
      }
      return a;
    },
    contexts: () => liveContexts,
    context(idx = 0) {
      const c = liveContexts[idx];
      if (!c) {
        throw new Error(`No FakeAudioContext at idx ${idx} (have ${liveContexts.length})`);
      }
      return c;
    },
    setNextPlayBehavior(b) {
      nextPlayBehavior = b;
    },
    document: fakeDoc
  };
}

export function uninstallAudioFakes(): void {
  vi.useRealTimers();
  vi.resetModules();
  liveAudios = [];
  liveContexts = [];
  nextPlayBehavior = "resolve";
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.Audio;
  delete g.AudioContext;
  // rAF/cAF are polyfilled onto the node global by install; remove them so
  // the next test file can either re-install (with a fresh setTimeout
  // backing) or run without inheriting our shim.
  delete g.requestAnimationFrame;
  delete g.cancelAnimationFrame;
  // Leave window/document attached — re-creating per test is brittle and
  // `vi.resetModules()` already gives us fresh singletons.
}

// Flush microtasks pending from `void el.play().catch(...)` etc. The audio
// engines lean on play()'s promise resolution to advance state; without
// flushing, assertions made the same tick as the play() call see stale state.
export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
