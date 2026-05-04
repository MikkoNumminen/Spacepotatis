"use client";

// Browsers block HTMLAudioElement.play() until the document has received a
// user gesture. The MusicEngine in `./music.ts` survives this via its
// per-engine watchdog (every 2s it kicks paused-but-armed elements), but
// `./story.ts` and any future raw-Audio caller have no such retry — a
// rejected play() at mount time silently strands the cinematic bed and
// Grandma's voice for the rest of the page lifetime.
//
// This module is the minimum sized hook that fixes that: a single shared
// "first gesture" listener that fires queued callbacks the moment the user
// activates the page. Engines call `onUserActivation(cb)` instead of
// `el.play()` directly; if the user has already activated, `cb` runs inline,
// otherwise it queues for the first pointerdown / keydown / touchstart.
//
// SSR-safe: registers listeners only when `window` exists and exposes
// `addEventListener`. The test fakes (see `./__tests__/fakeAudio.ts`) point
// `window` at `globalThis`, which doesn't have addEventListener, so the
// guard skips registration there — `_markActivatedForTesting` is the
// hand-crank for unit tests.

let activated = false;
const queue: Array<() => void> = [];
let listenersAttached = false;

function flush(): void {
  while (queue.length > 0) {
    const cb = queue.shift();
    if (!cb) continue;
    try {
      cb();
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[userActivation] callback threw", err);
      }
    }
  }
}

function markActivated(): void {
  if (activated) return;
  activated = true;
  detachListeners();
  flush();
}

const onGesture = (): void => {
  markActivated();
};

function attachListeners(): void {
  if (listenersAttached) return;
  if (typeof window === "undefined") return;
  if (typeof window.addEventListener !== "function") return;
  window.addEventListener("pointerdown", onGesture);
  window.addEventListener("keydown", onGesture);
  window.addEventListener("touchstart", onGesture);
  listenersAttached = true;
}

function detachListeners(): void {
  if (!listenersAttached) return;
  if (typeof window === "undefined") return;
  if (typeof window.removeEventListener !== "function") return;
  window.removeEventListener("pointerdown", onGesture);
  window.removeEventListener("keydown", onGesture);
  window.removeEventListener("touchstart", onGesture);
  listenersAttached = false;
}

attachListeners();

/**
 * Run `cb` immediately if the user has activated the page already, else
 * queue it to run inside the first pointerdown / keydown / touchstart
 * handler. Idempotent — call as many times as you like; each callback fires
 * exactly once.
 *
 * @stable
 */
export function onUserActivation(cb: () => void): void {
  if (activated) {
    cb();
    return;
  }
  queue.push(cb);
}

/**
 * Returns `true` iff the user has interacted with the document at least
 * once this session. Engines that don't need to defer can use this for a
 * cheap sync check.
 *
 * @stable
 */
export function isUserActivated(): boolean {
  return activated;
}

/**
 * Test-only escape hatch. Production code paths run through the gesture
 * listener; unit tests don't have a real DOM, so this lets them simulate
 * the first gesture without dispatching events. Idempotent.
 *
 * @internal
 */
export function _markActivatedForTesting(): void {
  markActivated();
}
