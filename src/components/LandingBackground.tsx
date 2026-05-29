"use client";

import { useEffect, useRef } from "react";

// Mounts the cinematic Three.js landing-scene canvas as a fixed-position
// backdrop. The whole module is a client island so the landing page can stay
// `force-static` — Three.js never runs at SSR/SSG, only after hydration.
//
// Honors prefers-reduced-motion: skips the auto-orbiting scene entirely and
// falls back to the plain dark background.
export default function LandingBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let disposed = false;
    let scene: { dispose(): void } | null = null;

    // Deep path (not the @/game/three barrel) so the dynamic-import chunk
    // for the landing page only pulls LandingScene's reachable graph, not
    // every three.js scene/sun/planet/orbit/transition module. Next.js
    // does not tree-shake dynamic imports of barrels.
    import("@/game/three/LandingScene")
      .then(({ LandingScene }) => {
        if (disposed) return;
        const instance = new LandingScene(canvas);
        if (disposed) {
          instance.dispose();
          return;
        }
        instance.start();
        scene = instance;
      })
      .catch(() => {
        // WebGL unavailable or chunk failed to load — silently leave the
        // canvas blank; the dark background still looks fine.
      });

    return () => {
      disposed = true;
      scene?.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // bg-space-bg on the canvas keeps the document dark while WebGL
      // is initializing or tearing down. Without it, the canvas's
      // transparent default backing color lets the browser show its
      // white user-agent default during page-nav teardown frames,
      // which the user sees as a flash on every route change.
      className="fixed inset-0 z-0 h-screen w-screen bg-space-bg"
    />
  );
}
