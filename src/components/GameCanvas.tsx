"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { CombatSummary } from "@/game/phaser/config";
import type { MissionDefinition, SolarSystemDefinition, SolarSystemId } from "@/types/game";
import LoadoutMenu from "@/components/LoadoutMenu";
import MissionSelect from "@/components/MissionSelect";
import SignInButton from "@/components/SignInButton";
import MuteToggle from "@/components/MuteToggle";
import { useGameState } from "@/game/state/useGameState";
import { setSolarSystem } from "@/game/state/GameState";
import { loadSave, saveNow, submitScore } from "@/game/state/sync";
import { getAllMissions } from "@/game/data/missions";
import { getAllSolarSystems, getSolarSystem } from "@/game/data/solarSystems";

const MISSIONS = getAllMissions();

function pickNextMission(
  unlocked: readonly string[],
  completed: readonly string[],
  systemId: SolarSystemId
): MissionDefinition | null {
  const playable = MISSIONS.filter(
    (m) => m.kind === "mission" && m.solarSystemId === systemId && unlocked.includes(m.id)
  );
  return (
    playable.find((m) => !completed.includes(m.id)) ??
    playable[playable.length - 1] ??
    null
  );
}

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
  const [loadoutOpen, setLoadoutOpen] = useState(false);
  const [warpOpen, setWarpOpen] = useState(false);
  const unlockedPlanets = useGameState((s) => s.unlockedPlanets);
  const completedMissions = useGameState((s) => s.completedMissions);
  const currentSolarSystemId = useGameState((s) => s.currentSolarSystemId);
  const unlockedSolarSystems = useGameState((s) => s.unlockedSolarSystems);

  // On entering the galaxy view, surface the next playable mission so the
  // launch panel is visible immediately. User can dismiss with × — it stays
  // closed until the next galaxy entry.
  useEffect(() => {
    if (mode !== "galaxy") return;
    const next = pickNextMission(unlockedPlanets, completedMissions, currentSolarSystemId);
    if (next) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentSolarSystemId]);

  // Hydrate from cloud save once on sign-in. No-op when unauthenticated.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    void loadSave();
  }, [authStatus]);

  // Galaxy lifecycle: mount GalaxyScene when mode=galaxy, tear down otherwise.
  // Re-mounts when the active solar system changes so the planet set + sun
  // tint reflect the new system. Cheap because Three.js disposal is fast.
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
        onPlanetSelect: setSelected,
        activeSystemId: currentSolarSystemId
      });
      scene.start();
      cleanup = () => scene.dispose();
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [mode, currentSolarSystemId]);

  // Combat lifecycle: mount Phaser into the parent div when mode=combat.
  // We route onComplete through a ref so a mid-combat auth flip ("loading"
  // → "authenticated") doesn't leave Phaser holding a stale closure that
  // skips saveNow()/submitScore(). Re-instantiating Phaser on auth changes
  // would be wasteful (and would tear down the active game), so the ref
  // pattern is the correct fix here.
  const completeRef = useRef<(summary: CombatSummary) => void | Promise<void>>(() => undefined);
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
        onComplete: (summary) => completeRef.current(summary)
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
  completeRef.current = handleMissionComplete;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-space-bg">
      {mode === "galaxy" && <canvas ref={galaxyCanvasRef} className="block h-full w-full" />}
      {mode === "combat" && <div ref={combatParentRef} className="h-full w-full" />}

      {mode === "galaxy" && (
        <div className="pointer-events-none absolute inset-0">
          <HudFrame
            hovered={hovered}
            lastSummary={lastSummary}
            onBackToMenu={() => router.push("/")}
            onOpenLoadout={() => setLoadoutOpen(true)}
            onOpenWarp={() => setWarpOpen(true)}
            warpAvailable={unlockedSolarSystems.length > 1}
          />
          <MissionSelect
            mission={selected}
            onClose={() => setSelected(null)}
            onLaunch={handleLaunch}
          />
          {loadoutOpen && (
            <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="relative w-[28rem] max-w-[92vw]">
                <button
                  type="button"
                  onClick={() => setLoadoutOpen(false)}
                  aria-label="Close"
                  className="absolute -right-2 -top-2 z-10 rounded-full border border-space-border bg-space-panel px-2 py-0.5 text-sm text-hud-green hover:text-hud-amber"
                >
                  ×
                </button>
                <LoadoutMenu mode="equip" />
              </div>
            </div>
          )}
          {warpOpen && (
            <WarpPicker
              currentSystemId={currentSolarSystemId}
              unlockedSystemIds={unlockedSolarSystems}
              onClose={() => setWarpOpen(false)}
              onSelect={(id) => {
                setSolarSystem(id);
                setWarpOpen(false);
              }}
            />
          )}
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

function StatsPanel({ credits, cleared }: { credits: number; cleared: number }) {
  return (
    <div className="flex flex-col gap-1.5 font-mono text-xs">
      <StatRow label="credits" value={`¢ ${credits}`} valueClass="text-hud-amber" />
      <StatRow label="cleared" value={String(cleared)} valueClass="text-hud-green" />
    </div>
  );
}

function StatRow({
  label,
  value,
  valueClass
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-20 text-[10px] uppercase tracking-[0.2em] text-hud-green/70">
        {label}
      </span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function HudFrame({
  hovered,
  lastSummary,
  onBackToMenu,
  onOpenLoadout,
  onOpenWarp,
  warpAvailable
}: {
  hovered: MissionDefinition | null;
  lastSummary: CombatSummary | null;
  onBackToMenu: () => void;
  onOpenLoadout: () => void;
  onOpenWarp: () => void;
  warpAvailable: boolean;
}) {
  const credits = useGameState((s) => s.credits);
  const cleared = useGameState((s) => s.completedMissions.length);
  const currentSystemId = useGameState((s) => s.currentSolarSystemId);
  const currentSystem = getSolarSystem(currentSystemId);

  return (
    <>
      <div className="absolute left-1/2 top-6 -translate-x-1/2 flex flex-col items-center">
        <div className="font-display text-xl tracking-widest text-hud-green/90 drop-shadow-[0_0_8px_rgba(94,255,167,0.25)]">
          SPACEPOTATIS
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-hud-amber/80">
          {currentSystem.name}
        </div>
      </div>
      <div className="absolute left-6 top-6 flex flex-col gap-3">
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={onBackToMenu}
            className="rounded border border-hud-green/60 px-3 py-1.5 font-mono text-xs text-hud-green/90 transition-colors hover:bg-hud-green/10"
          >
            ← Menu
          </button>
          <button
            type="button"
            onClick={onOpenLoadout}
            className="rounded border border-hud-green/60 px-3 py-1.5 font-mono text-xs text-hud-green/90 transition-colors hover:bg-hud-green/10"
          >
            Loadout
          </button>
          <button
            type="button"
            onClick={onOpenWarp}
            disabled={!warpAvailable}
            title={warpAvailable ? "Warp to another system" : "No other systems unlocked yet"}
            className="rounded border border-hud-green/60 px-3 py-1.5 font-mono text-xs text-hud-green/90 transition-colors enabled:hover:bg-hud-green/10 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
          >
            Warp
          </button>
        </div>
        <StatsPanel credits={credits} cleared={cleared} />
      </div>
      <div className="pointer-events-auto absolute right-6 top-6 flex items-center gap-3 font-mono text-[11px]">
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
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-center">
        {hovered && (
          <div className="rounded border border-space-border bg-space-panel/80 px-4 py-2 backdrop-blur-sm">
            <div className="font-display tracking-widest text-hud-green">{hovered.name}</div>
            <div className="text-[11px] text-hud-amber">
              {hovered.kind === "shop"
                ? "shop"
                : `difficulty ${"★".repeat(hovered.difficulty)}`}
            </div>
          </div>
        )}
        <div className="font-mono text-[11px] text-hud-green/60">
          drag to orbit · scroll to zoom · hover a planet · click to select
        </div>
      </div>
    </>
  );
}

function WarpPicker({
  currentSystemId,
  unlockedSystemIds,
  onClose,
  onSelect
}: {
  currentSystemId: SolarSystemId;
  unlockedSystemIds: readonly SolarSystemId[];
  onClose: () => void;
  onSelect: (id: SolarSystemId) => void;
}) {
  const systems: readonly SolarSystemDefinition[] = getAllSolarSystems().filter((s) =>
    unlockedSystemIds.includes(s.id)
  );

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-[28rem] max-w-[92vw] rounded border border-space-border bg-space-panel/95 p-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -right-2 -top-2 z-10 rounded-full border border-space-border bg-space-panel px-2 py-0.5 text-sm text-hud-green hover:text-hud-amber"
        >
          ×
        </button>
        <div className="font-display text-lg tracking-widest text-hud-green">WARP DRIVE</div>
        <p className="mt-1 text-[11px] text-hud-amber">Select a destination system.</p>
        <ul className="mt-4 flex flex-col gap-2">
          {systems.map((sys) => {
            const active = sys.id === currentSystemId;
            return (
              <li key={sys.id}>
                <button
                  type="button"
                  onClick={() => onSelect(sys.id)}
                  disabled={active}
                  className="w-full rounded border border-hud-green/60 bg-space-bg/40 px-3 py-2 text-left transition-colors enabled:hover:bg-hud-green/10 disabled:cursor-default disabled:border-space-border"
                >
                  <div className="flex items-baseline justify-between">
                    <span
                      className={`font-display tracking-widest ${active ? "text-hud-amber" : "text-hud-green"}`}
                    >
                      {sys.name}
                    </span>
                    <span
                      className="ml-3 inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: sys.sunColor }}
                      aria-hidden
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-hud-green/70">{sys.description}</div>
                  {active && (
                    <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-hud-amber/80">
                      current
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
