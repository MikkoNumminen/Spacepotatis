"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { CombatSummary } from "@/game/phaser/config";
import type { MissionDefinition } from "@/types/game";
import MissionSelect from "@/components/MissionSelect";
import SignInButton from "@/components/SignInButton";
import MuteToggle from "@/components/MuteToggle";
import { useGameState } from "@/game/state/useGameState";
import { loadSave, saveNow, submitScore } from "@/game/state/sync";

type Mode = "galaxy" | "combat";

export default function GameCanvas() {
  const galaxyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const combatParentRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const router = useRouter();
  const { status: authStatus } = useSession();
  const [mode, setMode] = useState<Mode>("galaxy");
  const [hovered, setHovered] = useState<MissionDefinition | null>(null);
  const [selected, setSelected] = useState<MissionDefinition | null>(null);
  const [launching, setLaunching] = useState<MissionDefinition | null>(null);
  const [lastSummary, setLastSummary] = useState<CombatSummary | null>(null);

  // Hydrate from cloud save once on sign-in. No-op when unauthenticated.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    void loadSave();
  }, [authStatus]);

  // Galaxy lifecycle: mount GalaxyScene when mode=galaxy, tear down otherwise.
  useEffect(() => {
    if (mode !== "galaxy") return;
    const canvas = galaxyCanvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const { GalaxyScene } = await import("@/game/three/GalaxyScene");
      if (disposed) return;
      const scene = new GalaxyScene(canvas, {
        onPlanetHover: setHovered,
        onPlanetSelect: setSelected
      });
      scene.start();
      cleanup = () => scene.dispose();
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [mode]);

  // Combat lifecycle: mount Phaser into the parent div when mode=combat.
  useEffect(() => {
    if (mode !== "combat") return;
    const parent = combatParentRef.current;
    if (!parent || !launching) return;

    let disposed = false;
    let game: import("phaser").Game | null = null;

    void (async () => {
      const { createPhaserGame } = await import("@/game/phaser/config");
      if (disposed || !combatParentRef.current) return;
      game = await createPhaserGame(combatParentRef.current, {
        missionId: launching.id,
        onComplete: handleMissionComplete
      });
    })();

    return () => {
      disposed = true;
      game?.destroy(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, launching]);

  const fadeOverlay = useCallback(async (toOpacity: number) => {
    const el = overlayRef.current;
    if (!el) return;
    const { fade } = await import("@/game/three/TransitionManager");
    await fade(el, toOpacity, 0.35).promise;
  }, []);

  const handleLaunch = useCallback(
    async (mission: MissionDefinition) => {
      if (mission.kind === "shop") {
        // Client-side nav preserves in-memory GameState (credits etc.).
        router.push("/shop");
        return;
      }
      setSelected(null);
      await fadeOverlay(1);
      setLaunching(mission);
      setMode("combat");
      requestAnimationFrame(() => void fadeOverlay(0));
    },
    [fadeOverlay, router]
  );

  const handleMissionComplete = useCallback(
    async (summary: CombatSummary) => {
      setLastSummary(summary);
      if (authStatus === "authenticated") {
        void saveNow();
        void submitScore(summary);
      }
      await fadeOverlay(1);
      setLaunching(null);
      setMode("galaxy");
      requestAnimationFrame(() => void fadeOverlay(0));
    },
    [fadeOverlay, authStatus]
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-space-bg">
      {mode === "galaxy" && <canvas ref={galaxyCanvasRef} className="block h-full w-full" />}
      {mode === "combat" && <div ref={combatParentRef} className="h-full w-full" />}

      {mode === "galaxy" && (
        <div className="pointer-events-none absolute inset-0">
          <HudFrame hovered={hovered} lastSummary={lastSummary} />
          <MissionSelect
            mission={selected}
            onClose={() => setSelected(null)}
            onLaunch={handleLaunch}
          />
        </div>
      )}

      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: 0 }}
      />
    </div>
  );
}

function HudFrame({
  hovered,
  lastSummary
}: {
  hovered: MissionDefinition | null;
  lastSummary: CombatSummary | null;
}) {
  const credits = useGameState((s) => s.credits);
  const cleared = useGameState((s) => s.completedMissions.length);

  return (
    <>
      <div className="absolute left-6 top-6 font-display text-xs tracking-[0.4em] text-hud-green/70">
        GALAXY · OVERWORLD
      </div>
      <div className="absolute left-1/2 top-6 -translate-x-1/2 font-mono text-xs">
        <span className="text-hud-amber">¢ {credits}</span>
        <span className="ml-4 text-hud-green/70">missions cleared {cleared}</span>
      </div>
      <div className="pointer-events-auto absolute right-6 top-6 flex items-center gap-3 font-mono text-[11px] text-space-border">
        <span>drag to orbit · scroll to zoom</span>
        <MuteToggle />
        <SignInButton compact />
      </div>
      {lastSummary && (
        <div className="absolute left-1/2 top-20 -translate-x-1/2 rounded border border-space-border bg-space-panel/70 px-4 py-2 text-center text-xs backdrop-blur-sm">
          <span className={lastSummary.victory ? "text-hud-green" : "text-hud-red"}>
            {lastSummary.victory ? "MISSION COMPLETE" : "MISSION FAILED"}
          </span>
          <span className="ml-3 text-hud-amber">¢ {lastSummary.credits}</span>
          <span className="ml-3 text-hud-green/70">score {lastSummary.score}</span>
        </div>
      )}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center">
        {hovered ? (
          <div className="rounded border border-space-border bg-space-panel/80 px-4 py-2 backdrop-blur-sm">
            <div className="font-display tracking-widest text-hud-green">{hovered.name}</div>
            <div className="text-[11px] text-hud-amber">
              {hovered.kind === "shop"
                ? "shop"
                : `difficulty ${"★".repeat(hovered.difficulty)}`}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-space-border">hover a planet · click to select</div>
        )}
      </div>
    </>
  );
}
