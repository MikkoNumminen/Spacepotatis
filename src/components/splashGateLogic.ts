// Pure decision split out of SplashGate.tsx so the test can import it
// without dragging JSX through Vite's transform — vitest runs in a Node
// environment with no jsx loader.
export function shouldHideSplash(ready: boolean, minTimeElapsed: boolean): boolean {
  return ready && minTimeElapsed;
}
