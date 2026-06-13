# content

## Purpose

The JSON catalog accessors and the cross-reference integrity check. Owns "what
weapons / enemies / missions / perks / augments / loot pools / solar systems /
story entries / mission-weapon rewards exist". Pure data layer — no game state,
no rendering, no audio.

Every read of game balance data flows through one of the accessors in this
folder. Consumers must NEVER import the raw JSON files directly: the accessor
is the contract, the JSON is the source.

## Public API

Per-catalog accessors (one row per JSON catalog):

- **Weapons** — [`weapons.ts`](weapons.ts): `getWeapon(id)`, `getAllWeapons()`,
  `WEAPON_IDS`, plus the pure stat helpers `weaponDps(w)` and `weaponRps(w)`.
- **Enemies** — [`enemies.ts`](enemies.ts): `getEnemy(id)`, `getAllEnemies()`.
- **Obstacles** — [`obstacles.ts`](obstacles.ts): `getObstacle(id)`, `getAllObstacles()`.
- **Missions** — [`missions.ts`](missions.ts): `getMission(id)`,
  `getAllMissions()`, `getCombatMissions()` (filters out shop/hub planets).
- **Perks** — [`perks.ts`](perks.ts): `PERKS`, `PERK_IDS`, plus the runtime
  helper `randomPerkId()` used by `PerkController`.
- **Augments** — [`augments.ts`](augments.ts): `getAugment(id)`,
  `getAllAugments()`, `AUGMENTS`, `AUGMENT_IDS`, `MAX_AUGMENTS_PER_WEAPON`,
  `foldAugmentEffects(ids)`, `NEUTRAL_AUGMENT_EFFECTS`.
- **Solar systems** — [`solarSystems.ts`](solarSystems.ts):
  `getSolarSystem(id)`, `getAllSolarSystems()`.
- **Loot pools** — [`lootPools.ts`](lootPools.ts): `getLootPool(id)`,
  `getAllLootPools()`.
- **Story** — [`story.ts`](story.ts): `STORY_ENTRIES`, `STORY_IDS`,
  `getStoryEntry(id)`, `isKnownStoryId(value)`.
- **Story trigger selectors** — [`storyTriggers.ts`](storyTriggers.ts):
  `selectFirstTimeEntry`, `selectOnSystemEnterEntry`,
  `selectOnMissionSelectEntry`, `selectReadyClearedIdleEntries`,
  `selectReadyAllClearedIdleEntries`.
- **Waves** — [`waves.ts`](waves.ts): `getWavesForMission(missionId)`,
  `getAllMissionWaves()`.
- **Mission-weapon rewards** — [`missionWeaponRewards.ts`](missionWeaponRewards.ts):
  `MISSION_WEAPON_REWARDS`, `getBuyableWeaponIds(completed)`,
  `getMissionForWeapon(weaponId)`.
- **Stats (presentation)** — [`stats.ts`](stats.ts): `getStat(id)`, `STATS`,
  `StatDefinition`. Thin presentation registry — inline weapon-card stat id →
  display label + icon + DETAILS body copy. The `StatId` union lives in
  [`src/types/game.ts`](../../types/game.ts). Voice convention:
  `/audio/stats/<id>-voice.mp3` (404s fail silently).
- **Upgrades (presentation)** — [`upgrades.ts`](upgrades.ts): `getUpgrade(id)`,
  `UPGRADES`, `UpgradeDefinition`. Thin presentation registry — upgrade id →
  display name + DETAILS body copy. The COST lives next door in
  [`upgradeCurves.ts`](upgradeCurves.ts); the `UpgradeId` union lives in
  [`src/types/game.ts`](../../types/game.ts). Voice convention:
  `/audio/upgrades/<id>-voice.mp3` (404s fail silently).
- **Cleared-state evaluation** — [`clearedState.ts`](clearedState.ts):
  `evaluateClearedBoundaries(input)` — pure progress check against the mission
  roster returning `{ systemNowCleared, everythingNowCleared }`, the
  cleared-system / everything-cleared verdict the idle audio cue consumes.
- **System-unlock gates** — [`systemUnlocks.ts`](systemUnlocks.ts):
  `SYSTEM_UNLOCK_GATES` — the `MissionId → SolarSystemId` map that unlocks a
  solar system on the matching mission completion. Read by both `state` and
  `saveValidation.ts`'s SEC-027 unlock derivation.
- **Upgrade curves** — [`upgradeCurves.ts`](upgradeCurves.ts): the pure
  `number → number` balance curves — `weaponUpgradeCost`, `shieldUpgradeCost`,
  `armorUpgradeCost`, `reactorCapacityCost`, `reactorRechargeCost`,
  `slotPurchaseCost`, `weaponDamageMultiplier`. Moved here from
  `state/ShipConfig.ts` (2026-06-12) so `saveValidation.ts`'s credit-cap
  derivation consumes them via the allowed `infra → content` edge. The
  ShipConfig-reading stat getters (`getMaxShield` etc.) stay in `state`.

Integrity check (mostly for tests):

- [`integrityCheck.ts`](integrityCheck.ts): `runDataIntegrityCheck(data)`,
  `buildLiveIntegrityData(missions)`, `IntegrityData` type.

Note: `REMOVED_WEAPON_BASE_COSTS` is referenced by the target architecture as
part of this module's API but TODAY lives in
[`src/game/state/persistence/salvageRemovedWeapons.ts`](../state/persistence/salvageRemovedWeapons.ts).
The Phase 3 extraction may relocate it; until then, treat it as a legacy
exception, not a permanent placement.

## Internal

- The raw JSON imports (`weaponsData`, `enemiesData`, …) are consumed at module
  load and are NEVER re-exported. Consumers must call accessors.
- The `randomPerkId()` helper in [`perks.ts`](perks.ts) is technically exported
  today but is implementation-detail (one call site in `PerkController`); treat
  it as `@internal`.
- The integrity-check string-distance helpers (`levenshtein`, `suggestSimilar`,
  `fail`) are file-local helpers. They never escape `integrityCheck.ts`.

## Dependencies

- [`schemas`](../../lib/schemas/) — Zod parsers used ONLY by the CI drift gate
  ([`__tests__/jsonSchemaValidation.test.ts`](__tests__/jsonSchemaValidation.test.ts)).
  No accessor file imports a schema at runtime.
- [`types`](../../types/game.ts) — every catalog row name (`WeaponId`,
  `EnemyId`, `MissionId`, `SolarSystemId`, `AugmentId`, `ObstacleId`) and
  every `*Definition` shape.
- NEVER `state`, `infra`, `audio`, `phaser`, `three`, `ui`, or `app`. The data
  layer is the deepest module; anything reaching back the other way is a cycle.

## Invariants

- **The accessor pattern.** Every catalog has a `getX(id)` (throws on unknown
  id) and a `getAllX()` (returns the full list, in catalog declaration order).
  Never read raw JSON outside an accessor file.
- **`*_IDS satisfies readonly XId[]`.** [`weapons.ts`](weapons.ts) and
  [`augments.ts`](augments.ts) use `as const satisfies readonly XId[]` to
  guarantee the runtime ID array stays in lockstep with the compile-time `XId`
  union. Drift (rename one, forget the other) fails `tsc`.
- **Presentation registries keyed by a `*Id` union use `Record<XId, XDefinition>`.**
  [`upgrades.ts`](upgrades.ts) (→ `UpgradeId`) and [`stats.ts`](stats.ts)
  (→ `StatId`) build their registry as `Record<XId, XDefinition>`; the union
  lives in [`src/types/game.ts`](../../types/game.ts). Adding a new
  upgrade/stat kind = (1) extend the union in `types/game.ts`, (2) add the
  registry row, (3) add it to the `UPGRADES` / `STATS` export array. `tsc`
  fails on any one missing — the `Record` makes a missing row a hard error,
  not a silent gap. Use [`/equipment`](../../../.claude/skills/equipment/SKILL.md)
  (new upgrade kind) and [`/voice-asset`](../../../.claude/skills/voice-asset/SKILL.md)
  (the matching `<id>-voice.mp3`) so the audio convention lands too.
- **The integrity check fires at module load via `missions.ts`.** The bottom
  of [`missions.ts`](missions.ts) calls
  `runDataIntegrityCheck(buildLiveIntegrityData(ALL_MISSIONS))` once at import
  time. `missions.ts` is the most universally-imported accessor (12+ call
  sites), so wiring the boot trigger here means every consumer of any
  mission/wave/loot/story data triggers the check before they read. Removing
  this call without a replacement trigger means dangling cross-references only
  surface at runtime via the silent `try/catch` in
  [`src/lib/saveValidation.ts`](../../lib/saveValidation.ts) — exactly the
  failure mode the integrity check exists to prevent.
- **No runtime Zod parses at module load.** Every accessor uses a single
  `as { catalog: readonly XDefinition[] }` cast at module load. The parse runs
  in CI via [`__tests__/jsonSchemaValidation.test.ts`](__tests__/jsonSchemaValidation.test.ts).
  Re-adding `Schema.parse(jsonData)` at module load costs ~98 kB of first-load
  JS on every static page (every page touches game data via `useGameState` /
  `MenuMusic`). PR history has the receipts; CI is the drift gate now.
- **Catalog removal preserves player progress.** When a weapon is deleted from
  [`weapons.json`](weapons.json), a refund entry MUST be added to
  [`src/game/state/persistence/salvageRemovedWeapons.ts`](../state/persistence/salvageRemovedWeapons.ts).
  Otherwise saved players holding the removed weapon lose credits silently.
  Tested by `salvageInvariants.test.ts` in that folder.
- **Mission-weapon mapping is total in both directions.** Every combat mission
  has exactly one weapon reward; every shop-buyable weapon has exactly one
  source mission. Tested by `missionWeaponRewards.test.ts` AND covered by
  `runDataIntegrityCheck`.
- **Story trigger discriminated union is exhaustive.** Adding a new
  `autoTrigger.kind` requires updating the integrity check switch
  ([`integrityCheck.ts:298`](integrityCheck.ts)) — the `_exhaustive: never`
  guard fails `tsc` if you forget.
- **Cost curves feed the server-side credit-cap derivation.** The curves in
  [`upgradeCurves.ts`](upgradeCurves.ts) are summed by
  [`src/lib/saveValidation.ts`](../../lib/saveValidation.ts) (it walks
  `weaponUpgradeCost` over the Mk ladder for the worst-case refund that sets
  `CREDITS_DELTA_SLACK`). A new curve that lets the player GAIN or REFUND
  credits must be reflected in that derivation or the cheat guard rejects
  legitimate saves; a pure credit SINK does not. When in doubt run
  [`/save-roundtrip-audit`](../../../.claude/skills/save-roundtrip-audit/SKILL.md).

## Common pitfalls

- **Adding a new mission/weapon/etc. without updating its `*_IDS` array.** The
  `satisfies readonly XId[]` guard catches it but only when `tsc` runs. Don't
  rely on the runtime — keep the array updated as part of the same edit.
- **Adding a new catalog cross-reference without extending
  `integrityCheck.ts`.** The check does NOT auto-discover new FK fields from
  the schemas. A dangling ref to a missing target only surfaces at runtime via
  `saveValidation.ts`'s try/catch (silent skip) or whenever the wave actually
  spawns. Header comment in
  [`integrityCheck.ts`](integrityCheck.ts) lists every cross-reference covered
  today; extend that comment too.
- **Removing a weapon from `weapons.json` without adding a refund entry.**
  Players holding the removed weapon lose credits silently and feel cheated.
  See `salvageRemovedWeapons.ts` + the salvage invariant test.
- **Calling a catalog accessor in another module's top-level code.** Already
  happens in [`src/game/state/stateCore.ts:33`](../state/stateCore.ts) and
  [`src/lib/saveValidation.ts:170`](../../lib/saveValidation.ts) (see
  [`docs/audit/04-found-bugs.md`](../../../docs/audit/04-found-bugs.md)). The
  accessor itself is fine; the module-load coupling is what's flagged. Prefer
  lazy-init inside the function that needs the derived data.
- **Re-adding `Schema.parse(jsonData)` at module load** to "be safe". CI's
  drift gate ALREADY enforces shape soundness. The runtime parse only adds
  bundle weight (~98 kB) and does not improve safety in production.

## How to test changes

- `npm test src/game/data` — runs every per-catalog test plus the integrity
  check tests.
- `npm test src/game/data/__tests__/jsonSchemaValidation.test.ts` — the JSON
  drift gate. Run this on every JSON edit; it's also wired into CI.
- `/balance-review` skill — diffs uncommitted changes to game data and reports
  DPS / TTK / energy-cost-per-DPS / augment-folded effective DPS / loot-pool
  roster shifts / drop-rate deltas vs HEAD.
- `/content-audit` skill — walks every cross-reference for orphan refs (the
  same coverage as `integrityCheck.ts` plus sprite generators, drop weights,
  and mission DAG sanity).
- `npm run typecheck` — catches any drift between `WEAPON_IDS` /
  `AUGMENT_IDS` and their `*Id` unions, plus the story-trigger exhaustiveness
  guard.

## Skills that touch this module

| Task | Skill |
|---|---|
| New combat mission or shop planet | `/new-mission` |
| New enemy type | `/new-enemy` |
| Anything weapon/equipment-related (CRUD + visuals) | `/equipment` |
| New mission perk (passive or active) | `/new-perk` |
| New solar system in the overworld | `/new-solar-system` |
| Anything story-related (entry, cinematic, voice, log copy) | `/new-story` |
| "What did this JSON tweak do to balance?" | `/balance-review` |
| Pre-commit content-invariants check | `/content-audit` |

## Where it ends, where the next module begins

The `content` module STOPS at "what is the catalog?". It does not own:

- Player state (what's currently equipped, completed) → [`state`](../state/).
- Audio playback of voice/music referenced by `StoryEntry.voiceTrack` / `musicTrack` → [`audio`](../audio/).
- Sprite generation for enemies / weapons referenced by `spriteKey` →
  `BootScene.ts` in [`phaser`](../phaser/).
- Galaxy mesh assembly using `MissionDefinition.texture` → [`three`](../three/).
- Cheat-guard derivations using `lootPools` or `enemies` (currently in
  [`saveValidation.ts:170`](../../lib/saveValidation.ts) — should be lazy-init).
