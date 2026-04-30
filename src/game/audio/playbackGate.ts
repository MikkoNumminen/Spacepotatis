// One-shot session-scoped flag flipped by the page's SplashGate when its
// loading screen has finished fading out. While the gate is closed, no
// audio engine should attempt to register gesture listeners or call
// .play() — stray pointerdown / keydown events fired during the splash
// (focus restoration after Cmd+R, in-flight transition clicks, etc.)
// can land before the page has full user-activation context for autoplay
// AND can spend a player's first real click on a doomed play() attempt
// that shows up as "menu music silently never started." Once flipped,
// it stays flipped for the session — navigating between pages does
// not re-close the gate.

let allowed = false;
const listeners = new Set<() => void>();

export function allowPlayback(): void {
  if (allowed) return;
  allowed = true;
  // Snapshot then clear: a callback that itself calls onPlaybackAllowed
  // (idempotent path) doesn't end up re-registering against an empty set.
  const snapshot = [...listeners];
  listeners.clear();
  for (const cb of snapshot) cb();
}

export function onPlaybackAllowed(cb: () => void): () => void {
  if (allowed) {
    cb();
    return () => {};
  }
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function isPlaybackAllowed(): boolean {
  return allowed;
}
