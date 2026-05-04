# state

> **HIGHEST-RISK MODULE in the codebase.** Owns the entire save round-trip. Any change here MUST run the existing `/save-roundtrip-audit` skill before commit. See ADR 0004 + CLAUDE.md §7a + [docs/INCIDENT_RUNBOOK.md](../../../docs/INCIDENT_RUNBOOK.md).

## Purpose

The GameState barrel + slices + the entire save round-trip pipeline. Owns "what does the player currently have, what have they completed, and how do we put that on disk and read it back without ever wiping a real player's progress".

The save-data perimeter lives here. Three layers of defence sit inside this module:

1. **Hydration gate** — `isHydrationCompleted` in `syncCache.ts` blocks `saveNow()` until a real load has either succeeded or been explicitly given up on. Without this, a load failure could let `INITIAL_STATE` POST over a real save.
2. **Server-side regression guard** — `validateNoRegression` lives in `infra` (`src/lib/saveValidation.ts`) but is consumed by the POST handler that this module's `sync.ts` posts to. The two sides of the contract: state ships the snapshot; infra refuses to overwrite if monotonic fields shrank.
3. **Pending-save queue** — `saveQueue.ts` holds the snapshot in localStorage stamped with the player's email until the server accepts it. A 422 `save_regression` is held until the next successful load reconciles.

Past incidents these guards exist to prevent: see `docs/INCIDENT_RUNBOOK.md`.

## Public API

The `GameState.ts` barrel re-exports the entire public surface. Anything not listed here is INTERNAL.

### State accessors ([GameState.ts](./GameState.ts), [stateCore.ts](./stateCore.ts), [useGameState.ts](./useGameState.ts))

- `getState()` — synchronous current snapshot.
- `subscribe(cb)` — unsubscribe-returning subscription for non-React consumers.
- `commit(next)` — internal mutator entry point (use the typed mutators below in app code).
- `useGameState(selector)` — React hook backed by `useSyncExternalStore`. The selector pattern is canonical; do not re-implement subscriptions in components.

### Mutators ([shipMutators.ts](./shipMutators.ts), [stateCore.ts](./stateCore.ts), [pricing.ts](./pricing.ts), [rewards.ts](./rewards.ts))

Every state change goes through one of these:

- Credits + time: `addCredits`, `spendCredits`, `addPlayedTime`
- Mission progression: `completeMission`, `setSolarSystem`, `markStorySeen`, `isMissionCompleted`, `isPlanetUnlocked`
- Ship purchases / upgrades: `buyWeapon`, `buyAugment`, `buyShieldUpgrade`, `buyArmorUpgrade`, `buyReactorCapacityUpgrade`, `buyReactorRechargeUpgrade`, `buyWeaponUpgrade`, `equipFromInventory`, `installAugment`, `grantAugment`, `sellWeapon`, `grantWeapon`, `ownsAnyOfType`
- Sell pricing: `getSellPrice`
- Test escape hatch: `resetForTests`

### Save round-trip surface ([sync.ts](./sync.ts), [syncCache.ts](./syncCache.ts), [saveQueue.ts](./saveQueue.ts), [scoreQueue.ts](./scoreQueue.ts))

- `loadSave(...)` — the canonical load path. Returns a typed `LoadResult` union: `server-loaded` / `anon` / `no-save` / `pending-only` / `load-failed`. The union is the contract the splash UI consumes; collapsing it back to a boolean was the bug behind the 2026-05-02 silent-INITIAL_STATE wipe.
- `saveNow()` — POST-current-snapshot. Gated by `isHydrationCompleted` so a load failure cannot trigger a wipe.
- `flushSaveQueue()` — drain the localStorage-pending save (account-stamped). Safe to call repeatedly; idempotent.
- `markSavePending(snapshot)` — explicit queue write (for retry-after-422 paths).
- `clearLoadSaveCache()` — sign-out helper. Wipes the module-level cache + the pending-save queue + the hydration flag.
- `enqueueScore(score)` / `drainScoreQueue()` — leaderboard durability. Same shape as the save queue; the leaderboard is required to be eventually-consistent. **Never bypass — `enqueueScore` first, then drain.** Fire-and-forget POSTs lose scores.
- `LoadResult` type — re-exported for components that switch on the result kind.

### ShipConfig values ([ShipConfig.ts](./ShipConfig.ts))

- Defaults + caps: `DEFAULT_SHIP`, `MAX_LEVEL`, `MAX_AUGMENTS_PER_WEAPON`, `MAX_WEAPON_SLOTS`
- Cost curves: `weaponUpgradeCost`, `shieldUpgradeCost`, `armorUpgradeCost`, `reactorCapacityCost`, `reactorRechargeCost`
- Effective stats: `weaponDamageMultiplier`, `getMaxShield`, `getMaxArmor`, `getReactorCapacity`, `getReactorRecharge`
- Ship instance helper: `newWeaponInstance`
- Re-exported types: `ShipConfig`, `WeaponInstance`, `WeaponPosition`, `ReactorConfig`

### Constants

- `INITIAL_STATE` — the first-load default. The `unlockedSolarSystems` field is the FALLBACK only; `hydrate()` re-derives the actual set from `completedMissions` ∩ `SYSTEM_UNLOCK_GATES`. Don't read `INITIAL_STATE.unlockedSolarSystems` thinking it's the truth.
- `SYSTEM_UNLOCK_GATES` — `MissionId → SolarSystemId` map. Completing the mission unlocks the system on the next commit. Source of truth for the re-derive in `hydrate()`.

### Story-trigger seen-set helpers ([seenStoriesLocal.ts](./seenStoriesLocal.ts))

- `readSeenStoriesLocal()`, `writeSeenStoriesLocal(ids)` — localStorage backing for the seen-set. The server-side seen list is unioned with this on hydrate.

## Internal

These are exported from individual files but are NOT part of the module's contract. Treat as implementation detail; they may be renamed or moved without notice.

- The `persistence/` subfolder is **entirely internal**. Only `persistence.ts` exposes `hydrate` and `toSnapshot` to the outside; the per-shape migrators (`migrateNewShape`, `migrateLegacyIdArray`, `migrateNamedSlots`, `migratePrimaryWeapon`), the `safetyNet`, `salvageRemovedWeapons`, `helpers`, `legacyShared`, `types` — these are the private surface.
- `syncCache.ts`'s mutable refs (`currentPlayerEmail`, `lastLoadResult`, `inflight`, `hydrationCompleted`) are owned here. External code goes through `clearLoadSaveCache()` only.
- `saveQueue.ts`'s localStorage versioning (`spacepotatis:pendingSave:v2`) is internal. The `:v1` key is silently dropped on read because it lacked the `playerEmail` stamp (account-leak risk on shared browsers).

## Dependencies

| Dependency | Used by | Why |
|---|---|---|
| `@/game/data/*` (catalog accessors) | `stateCore.ts` (mission graph), `shipMutators.ts` (weapon catalog), `rewards.ts` (loot pools), `persistence/` (refund map) | Catalog reads. **One-way** — `state` depends on `content`, never the reverse. |
| `@/lib/schemas/save` | `sync.ts` (POST payload validation, response parsing) | Zod parsers at the network edge. CLAUDE.md §5 forbids `as` casts at the edge. |
| `@/lib/routes` | `sync.ts` (route constants for `/api/save`, `/api/leaderboard`) | Centralized route paths. |
| `@/types/game` | many | Shared types for IDs and definitions. |

**No** dependency on `phaser`, `three`, `audio`, `ui`, `app`, `infra` (apart from the schemas + routes constants above).

## Invariants

The save round-trip has **8 layers** end-to-end. Adding a `StateSnapshot` field that doesn't thread through ALL 8 causes silent drops. Use `/save-roundtrip-audit` to verify before committing any save-shape change. See ADR 0004.

- **`INITIAL_STATE.unlockedSolarSystems` is the FALLBACK only.** `hydrate()` re-derives the real set from `completedMissions` ∩ `SYSTEM_UNLOCK_GATES`. Persisting the array directly creates a truth-duplication bug where the gate map and the persisted array could disagree. Documented in [persistence.ts](./persistence.ts).
- **`migrateShip` silently DROPS unknown weapon and augment ids.** This is by design (legacy id reaping), but the salvage step in `salvageRemovedWeapons.ts` MUST run BEFORE the per-shape migrators so removed-from-catalog ids get refunded as credits. The refund map `REMOVED_WEAPON_BASE_COSTS` is load-bearing — never delete entries even after a re-introduction (entry stays harmless because live ids are checked against the catalog first).
- **`isHydrationCompleted` gates `saveNow()`.** A load failure must NEVER let `INITIAL_STATE` POST over a real save. This is the client-side half of the 2026-05-02 wipe defense; the server-side `validateNoRegression` is the other half.
- **`saveQueue` localStorage key is versioned (`:v2`).** The `:v1` shape lacked a `playerEmail` stamp and could leak across accounts on shared browsers. The read path silently drops any leftover `:v1` blob.
- **`saveQueue` flush refuses to POST if the stamped email doesn't match the currently signed-in account.** Sign-out clears the queue.
- **`completeMission` is the ONLY path that updates `unlockedPlanets` + triggers the system-gate unlock.** Don't write to `unlockedPlanets` from anywhere else.
- **422 `save_regression` is TRANSIENT, not permanent.** The saveQueue holds the snapshot and retries after the next successful loadSave hydrates real state. Never treat 422 as account-fatal — that's the cheat-guard convention from ADR 0003.

## Common pitfalls

- **Adding a `StateSnapshot` field without threading it through all 8 layers.** Run `/save-roundtrip-audit` before committing.
- **Reading `INITIAL_STATE.unlockedSolarSystems`** thinking it's the player's actual unlocked set. It's the fresh-account fallback only; `hydrate()` re-derives the real set.
- **Editing a persistence migrator without testing legacy save fixtures.** `migrateLegacyIdArray.test.ts`, `migrateNamedSlots.test.ts`, `migratePrimaryWeapon.test.ts`, `migrateNewShape.test.ts`, `safetyNet.test.ts`, `salvageRemovedWeapons.test.ts` exist for exactly this. They cover the four legacy shapes the migrator must handle.
- **Removing a weapon from `weapons.json` without adding a refund entry to `REMOVED_WEAPON_BASE_COSTS`.** Players lose credits silently. The `salvageInvariants.test.ts` cross-checks TODO.md's "Phase Vegetable-Catalog" backlog against the refund map.
- **Calling `saveNow()` before the load completes.** `isHydrationCompleted` blocks this; if you find yourself working around the gate, you're undoing the 2026-05-02-wipe defense.
- **Bypassing `enqueueScore` for the leaderboard.** Fire-and-forget POSTs lose scores when offline or when the response is slow. The queue auto-retries on mount/visibility/online.
- **Writing the localStorage key directly with a different version suffix.** Use the existing `:v2` key; if you need a new shape, bump to `:v3` and write a one-shot drop of the older key (see what `:v1` → `:v2` did).
- **The `state/stateCore.ts:33` module-load `getAllMissions()` call** triggers `runDataIntegrityCheck` at import time. Acceptable today, but if you lazy-load `INITIAL_STATE`, also lazy-load the integrity-check trigger or persistence breaks at boot.

## How to test changes

```bash
# Whole module
npm test src/game/state

# Specific files (the most important ones)
npm test src/game/state/GameState.test.ts
npm test src/game/state/sync.test.ts
npm test src/game/state/persistence
npm test src/game/state/saveQueue.test.ts
npm test src/game/state/scoreQueue.test.ts
npm test src/game/state/syncCache.test.ts
npm test src/game/state/ShipConfig.test.ts
npm test src/game/state/pricing.test.ts
npm test src/game/state/rewards.test.ts

# Save round-trip audit (required before committing save-shape changes)
# Invoke via `/save-roundtrip-audit` skill
```

What each test covers:

- `GameState.test.ts` — every public mutator + the hydrate/snapshot round-trip + the system-unlock gate logic.
- `sync.test.ts` — `loadSave` and `saveNow` against fake fetch + the 5-arm `LoadResult` union.
- `persistence/*.test.ts` — per-shape migrators against the four legacy save shapes + the salvage step ordering.
- `saveQueue.test.ts`, `scoreQueue.test.ts` — localStorage durability, account stamp invariants, drain semantics.
- `syncCache.test.ts` — `currentPlayerEmail` swap detection, hydration-flag lifecycle, `lastLoadResult` mirror.
- `ShipConfig.test.ts` — DEFAULT_SHIP shape + cost-curve sanity.
- `pricing.test.ts` — sell-back math, including augment-bound-to-weapon destruction semantics.
- `rewards.test.ts` — first-clear loot pool selection.

## See also

- ADR 0003 — anti-cheat is observation, not enforcement (422 transient pattern).
- ADR 0004 — save round-trip's 8 layers (this module owns layers 1, 2, 7, 8).
- ADR 0007 — the 2026-05-04 modular-architecture audit.
- [docs/INCIDENT_RUNBOOK.md](../../../docs/INCIDENT_RUNBOOK.md) — every save-data incident this module's defenses were built to prevent.
- CLAUDE.md §7a — the migration shipping rule that pairs with this module's invariants.
- CLAUDE.md §11 — the where-things-live map for save persistence.
