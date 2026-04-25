"use client";

import dynamic from "next/dynamic";

// Phaser and Three.js rely on `window` — must never run during SSR/SSG.
// next/dynamic with ssr:false ensures the component only mounts in the browser
// and its code splits into its own chunk.
const GameCanvas = dynamic(() => import("@/components/GameCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-space-bg text-hud-green font-mono">
      Loading game…
    </div>
  )
});

export default function PlayPage() {
  return <GameCanvas />;
}
