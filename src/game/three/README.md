# three

## Purpose

The three.js galaxy overworld — the 3D scene rendered behind every page that shows the galaxy view. Owns starfield generation, sun rendering, planet meshes, orbits, and raycasting for click-to-select. Loaded **only client-side** via `next/dynamic({ ssr: false })`; importing this module from a server component breaks SSG.

The galaxy view is one of the three pillars of the game (CLAUDE.md §1). Everything 3D lives here; 2D combat lives in `phaser`.

## Public API

- `createSceneRig(options)` — the canonical scene factory. Returns the renderer, camera, lighting setup, fog, and the starfield. Single source of truth for renderer setup; don't construct `THREE.WebGLRenderer` outside it.
- `disposeSceneRig(rig)` — explicit teardown. MUST be called on scene unmount; without it, GPU memory leaks across system warps.
- `Sun`, `Planet`, `Orbit`, `Starfield` — entity factories used by the scene assembly + by tests. Each owns its own `dispose()`.
- `Planet`-specific helpers: per-mission color overrides, ring config, scale.
- `paintDiffuse(...)` — the planet-texture pipeline entry point in `planetTexture.ts`. Used by `Planet.ts` to generate per-mission diffuse textures procedurally.

The galaxy scene orchestrator (the file that wires SceneRig + planets + orbits + raycaster into a working 3D view) sits in this folder too; its constructor + lifecycle methods are the integration surface UI components consume via `useGalaxyScene` (in `src/components/hooks/`).

## Internal

- `styleFor(missionId)` in `planetTexture.ts:35-147` — the per-mission style switch. **Currently non-exhaustive over `MissionId`.** See "Sharp edges" below.
- Per-mesh dispose helpers and ref-counting bookkeeping inside `Planet.ts` and `Orbit.ts`.
- The starfield's per-frame jitter math (drift) is implementation detail — don't reach in to override.

## Dependencies

| Dependency | Used by | Why |
|---|---|---|
| `three` | every file | The 3D rendering library. |
| `@/game/data/missions`, `@/game/data/solarSystems` | `Planet.ts`, the galaxy scene orchestrator | Per-mission color/scale + per-system sun config. |
| `@/types/game` | many | `MissionId`, `SolarSystemId`, `MissionDefinition`, etc. |

NEVER `state` (galaxy view consumes state via UI props, not directly), NEVER `phaser`, NEVER `audio` (audio engines are fired from React effects, not from three.js scenes).

## Invariants

- **Module is client-only.** Pages that show the galaxy view dynamically import via `next/dynamic({ ssr: false })`. Importing `three` server-side throws because `THREE.WebGLRenderer` requires `window`/`document`. CLAUDE.md §3 + §9.
- **`SceneRig` is the single source of truth for renderer/lighting.** Don't construct `THREE.WebGLRenderer` outside it — that's the contract that lets headless tests fake the rig and that lets the production scene swap renderers (e.g. for HiDPI) in one place.
- **Every geometry/material/texture MUST be disposed on scene unmount.** Three.js does NOT garbage-collect GPU resources automatically. Without explicit `dispose()` calls, memory leaks accumulate across every system warp and reload.
- **Animation frames are scheduled by the orchestrator and cancelled on unmount.** Don't start a `requestAnimationFrame` loop outside the orchestrator's lifecycle.

## Common pitfalls

### Sharp edges

- **`planetTexture.ts#styleFor` is NON-EXHAUSTIVE over `MissionId`.** Adding a new mission to `missions.json` (which the integrity check deliberately doesn't validate against sprite/texture generators — see `integrityCheck.ts:50-53`) Zod-validates fine but **crashes inside `paintDiffuse()` at render time** for any mission id not in the switch. The TS compiler doesn't catch this because the switch returns a default fallback that doesn't actually exhaust the union.
  - **Fix path** (audit recommendation, deferred): move per-mission style data into `missions.json` as a content-schema field. The Zod parser then catches missing entries at module load. Until then, **adding a new mission requires also adding a `styleFor` case** — and this is easy to forget.
  - See `04-found-bugs.md` for the original audit-flagged entry.

### Other pitfalls

- **Server-side import.** Forgetting `next/dynamic({ ssr: false })` on the consuming page kills the build. Symptoms: `ReferenceError: window is not defined` during `next build`.
- **Missing `dispose()` on unmount.** Symptoms: GPU memory growth across system warps, eventual WebGL context loss.
- **Mutating `Planet`'s mesh ref directly.** Use the entity's typed mutators; the orchestrator caches ref → entity mappings for raycasting hit-tests, and a direct mutation breaks the cache.
- **Reaching into `state` from this module.** Don't. The galaxy view consumes state via React props at the orchestrator boundary. If you find yourself wanting to import `useGameState` here, you're in the wrong layer — the consuming hook is `useGalaxyScene` in `src/components/hooks/`.

## How to test changes

```bash
# Whole module
npm test src/game/three

# Type-only
npm run typecheck

# Manual smoke (no automated test for the WebGL output)
npm run dev
# Then: load /play, dock, warp between systems, click planets, confirm:
#  - Starfield drifts smoothly
#  - Sun tints per system
#  - Planets render with per-mission textures
#  - No console errors during system warp (dispose path)
#  - GPU memory in Chrome DevTools ▸ Performance Monitor stays bounded
```

## See also

- ADR 0001 — static-by-default + Phaser/Three behind `next/dynamic`.
- ADR 0007 — the modular-architecture audit.
- CLAUDE.md §3, §9 — the SSR-off rule.
- `src/game/data/missions.json` — the catalog this module renders.
- `src/components/hooks/useGalaxyScene.ts` — the React boundary that mounts/unmounts this module.
- `04-found-bugs.md` (in `docs/audit/`) — the `styleFor` non-exhaustive entry tracked for a future fix.
