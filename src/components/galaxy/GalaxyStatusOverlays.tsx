// Presentational status overlays for the galaxy view, extracted from
// GameCanvas. Two mutually-exclusive surfaces (the transition flag requires
// `!galaxyError`, so they can't both show):
//
//   - Transition overlay: a post-boot warp where GalaxyScene is rebuilding.
//     The splash is gone by now, so without this the player would see the
//     prior canvas frozen — or a blank dark area — for the 100–900ms rebuild
//     window (longer if useGalaxyScene retries a transient init failure).
//   - Renderer-error overlay: a dynamic-import / WebGL / Phaser init failure.
//     By the time `rendererError` is truthy the retry budget in
//     useGalaxyScene/usePhaserGame is exhausted. Without this the player would
//     see a blank canvas (combat) or a stuck splash (galaxy) with no signal.
//
// Suppressed under `showLoadError` so the SaveLoadErrorOverlay (a sibling of
// SplashGate) owns the viewport on a load failure.
export default function GalaxyStatusOverlays({
  showTransition,
  rendererError,
  showLoadError
}: {
  showTransition: boolean;
  rendererError: string | null;
  showLoadError: boolean;
}) {
  return (
    <>
      {showTransition && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-0 z-[55] flex items-center justify-center bg-space-bg/80 backdrop-blur-xs"
        >
          <div className="select-none rounded border border-hud-green/40 bg-space-bg/80 p-5 shadow-[0_0_30px_rgba(94,255,167,0.15)] sm:p-6">
            <div className="font-display text-xl tracking-widest text-hud-green animate-pulse sm:text-2xl">
              SPINNING UP GALAXY VIEW…
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.3em] text-hud-amber/70">
              warp transit
            </div>
          </div>
        </div>
      )}
      {rendererError && !showLoadError && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="renderer-error-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-space-bg/90 p-4 backdrop-blur-xs"
        >
          <div className="select-none rounded border border-hud-red/40 bg-space-bg/90 p-5 shadow-[0_0_30px_rgba(255,94,94,0.25)] sm:p-6">
            <div
              id="renderer-error-title"
              className="font-display text-2xl tracking-widest text-hud-red sm:text-3xl"
            >
              RENDERER FAILED TO START
            </div>
            <p className="mt-5 max-w-sm font-mono text-sm text-hud-amber/90">
              {rendererError}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
