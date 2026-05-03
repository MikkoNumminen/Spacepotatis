// Pure decision split out of SplashGate.tsx so the test can import it
// without dragging JSX through Vite's transform — vitest runs in a Node
// environment with no jsx loader.
export function shouldHideSplash(ready: boolean, minTimeElapsed: boolean): boolean {
  return ready && minTimeElapsed;
}

// `failed` short-circuits the gate: when a sibling overlay needs to take
// over the screen (e.g. SaveLoadErrorOverlay on a load-failed status), the
// splash MUST drop out of the tree immediately regardless of `ready` /
// `minTimeElapsed`. Without this, the splash's `fixed inset-0 z-50
// pointer-events-auto` shell sits on top of the overlay and the player
// cannot click any of its buttons. See PR #101 follow-up.
export function shouldUnmountImmediately(failed: boolean): boolean {
  return failed;
}
