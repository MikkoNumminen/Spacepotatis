"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { MissionDefinition, MissionId, SolarSystemId } from "@/types";
import { getAllMissions } from "@/game/data";
import type { GalaxyScene, MissionStatus, MissionStatusMap } from "@/game/three";
import { retryWithBackoff } from "./retryWithBackoff";

const STATUS_CLEARED: MissionStatus = { label: "✓ Cleared", color: "#5effa7" };
const STATUS_AVAILABLE: MissionStatus = { label: "Available", color: "#ffcc33" };
const STATUS_LOCKED: MissionStatus = { label: "Locked", color: "#7a8898" };
const STATUS_SHOP: MissionStatus = { label: "Shop", color: "#9ce8ff" };

function buildStatusMap(
  completedMissions: readonly MissionId[],
  unlockedPlanets: readonly MissionId[]
): MissionStatusMap {
  const completed = new Set(completedMissions);
  const unlocked = new Set(unlockedPlanets);
  const map = new Map<MissionId, MissionStatus>();
  for (const m of getAllMissions()) {
    if (m.kind === "scenery") continue;
    if (m.kind === "shop") {
      map.set(m.id, STATUS_SHOP);
    } else if (completed.has(m.id)) {
      map.set(m.id, STATUS_CLEARED);
    } else if (unlocked.has(m.id)) {
      map.set(m.id, STATUS_AVAILABLE);
    } else {
      map.set(m.id, STATUS_LOCKED);
    }
  }
  return map;
}

// Retry budget for transient init failures (WebGL context blip during the
// dispose/recreate dance on warp, dynamic-import flake, etc.). Each attempt
// is gated by the `disposed` flag so a cleanup mid-flight stops the loop.
const MAX_INIT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

// Returns `ready` so SplashGate can wait for the first rendered frame
// before fading the boot screen out — rendering the HUD over a black
// canvas looks worse than holding the splash an extra ~50ms.
//
// Returns `error` so the consumer can surface a "couldn't start galaxy
// view" overlay when the dynamic import, WebGL context, or GalaxyScene
// constructor throws. Without this, `ready` would never flip and
// SplashGate would hold the boot screen forever with no diagnostic.
// The error is only set after MAX_INIT_ATTEMPTS — transient blips that
// recover on a retry never reach the user.
export function useGalaxyScene({
  enabled,
  canvasRef,
  currentSolarSystemId,
  completedMissions,
  unlockedPlanets,
  onHover,
  onSelect
}: {
  enabled: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  currentSolarSystemId: SolarSystemId;
  completedMissions: readonly MissionId[];
  unlockedPlanets: readonly MissionId[];
  onHover: (mission: MissionDefinition | null) => void;
  onSelect: (mission: MissionDefinition | null) => void;
}): { ready: boolean; error: string | null } {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sceneRef = useRef<GalaxyScene | null>(null);

  // Recompute the status map whenever progress changes. Both effects below
  // read this — the build effect snapshots it for the constructor, the
  // apply effect re-pushes it to the live scene on subsequent updates.
  const statusMap = useMemo(
    () => buildStatusMap(completedMissions, unlockedPlanets),
    [completedMissions, unlockedPlanets]
  );
  const statusMapRef = useRef(statusMap);
  statusMapRef.current = statusMap;

  useEffect(() => {
    setReady(false);
    setError(null);
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Stop the browser from claiming touch gestures (page scroll, pinch-zoom,
    // double-tap-zoom) so our pointer/touch handlers see them all.
    canvas.style.touchAction = "none";

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const result = await retryWithBackoff<GalaxyScene>(
        async () => {
          // Deep path (not the @/game/three barrel) so the galaxy-route
          // chunk only loads GalaxyScene's reachable graph, not every
          // three.js module in the directory. Next.js does not tree-shake
          // dynamic imports of barrels.
          const { GalaxyScene } = await import("@/game/three/GalaxyScene");
          let scene: GalaxyScene | null = null;
          try {
            scene = new GalaxyScene(canvas, {
              onPlanetHover: onHover,
              onPlanetSelect: onSelect,
              activeSystemId: currentSolarSystemId,
              initialStatuses: statusMapRef.current
            });
            scene.start();
            return scene;
          } catch (err) {
            // Partial init may leave a scene holding GL resources.
            // Dispose before letting the retry loop see the throw so
            // retried attempts can't accumulate dead contexts. dispose
            // may also throw on a half-dead context; swallow.
            if (scene) {
              try {
                scene.dispose();
              } catch {
                /* best-effort */
              }
            }
            throw err;
          }
        },
        {
          maxAttempts: MAX_INIT_ATTEMPTS,
          delayMs: RETRY_DELAY_MS,
          isCancelled: () => disposed,
          onAttemptFailed: (err, attempt) =>
            console.error(
              `useGalaxyScene: attempt ${attempt}/${MAX_INIT_ATTEMPTS} failed`,
              err
            )
        }
      );

      if (result.kind === "cancelled") return;
      if (result.kind === "failed") {
        setError("Failed to start galaxy view. Refresh the page.");
        return;
      }

      const scene = result.value;
      if (disposed) {
        // Cleanup raced us between attempt success and now. Dispose the
        // live scene so its WebGL context + tickers don't leak.
        scene.dispose();
        return;
      }
      sceneRef.current = scene;
      requestAnimationFrame(() => {
        if (!disposed) setReady(true);
      });
      cleanup = () => {
        sceneRef.current = null;
        scene.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [enabled, canvasRef, currentSolarSystemId, onHover, onSelect]);

  // Mission clears and planet unlocks happen mid-session; push the new
  // status map to the live scene without rebuilding the rig.
  useEffect(() => {
    sceneRef.current?.applyStatuses(statusMap);
  }, [statusMap]);

  return { ready, error };
}
