"use client";

import nextDynamic from "next/dynamic";

// The page itself is a tiny deterministic shell — pre-render at build time
// and serve via the CDN so /play never wakes a serverless function. The
// real game (Phaser + Three) ships in the GameCanvas chunk, hydrated
// client-side by nextDynamic with ssr:false.
export const dynamic = "force-static";

// Phaser and Three.js rely on `window` — must never run during SSR/SSG.
// next/dynamic with ssr:false ensures the component only mounts in the browser
// and its code splits into its own chunk.
const GameCanvas = nextDynamic(() => import("@/components/GameCanvas"), {
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
