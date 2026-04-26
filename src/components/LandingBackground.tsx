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

    import("@/game/three/LandingScene")
      .then(({ LandingScene }) => {
        if (disposed) return;
        const instance = new LandingScene(canvas);
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
      className="fixed inset-0 z-0 h-screen w-screen"
    />
  );
}
