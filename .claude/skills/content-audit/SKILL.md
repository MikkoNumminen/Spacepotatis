---
name: content-audit
description: Pre-commit content invariants check — orphan refs (enemy / obstacle / weapon / sprite / pod / loot-pool / mission system / story trigger), missing sprite generators, perk drop-weight sanity, mission prereq DAG, story integrity (voice + music files, trigger refs, storyTriggers helper coverage).
---

# When to use
Invoke on `/content-audit`, "is the content safe to commit," or before a PR touching `src/game/data/`, `src/game/data/story.ts`, `src/game/data/storyTriggers.ts`, `src/game/data/lootPools.ts`, `src/game/data/augments.ts`, `src/game/phaser/scenes/BootScene.ts`, `src/game/phaser/scenes/CombatScene.ts`, `src/game/phaser/entities/Enemy.ts`, or `public/`. Read-only — never modify any file.

# Steps (the audit checklist)

> Note: `runDataIntegrityCheck` (`src/game/data/integrityCheck.ts`, covered by `integrityCheck.test.ts`) statically enforces the `StoryAutoTrigger` exhaustiveness and several ref checks below, so a clean `tsc` / `vitest` run already covers them. This skill's distinct value is the `public/` filesystem and sprite-generator checks the type system cannot see.

1. **Smoke check (covered by vitest)** — Build `enemyIds = Set(enemies[].id)` from `enemies.json`; for every `missions[].waves[].spawns[].enemy` in `waves.json`, verify membership. Same for `obstacleSpawns[].obstacle` vs `obstacles.json` ids. Covered by `data.test.ts` — re-report so a skipped-test run still flags drift.
2. **Orphan weapon refs in shop entries** — From `weapons.json` build `weaponIds`. In `missions.json`, for every `kind: "shop"` mission scan any weapon-listing field (`shopWeapons`, `inventory`, …). If absent on every shop, report "no shop weapon list yet — skipped" (today's shop sources inventory dynamically via `lootPools.ts` — see step 9). Otherwise verify each id — cap individual traces at 5 and **batch the rest into a single alternation grep** (this still checks every id; don't spelunk per-id).
3. **Sprite-key coverage** — Grep `BootScene.generateTextures()` for the first arg of every `draw*("key", …)` to build `bootSceneKeys`. Required keys:
   - `enemy.spriteKey` from `enemies.json` (today 23 — derive from the JSON at run time, don't trust a hard-coded list).
   - `obstacle.spriteKey` from `obstacles.json` (today 1: `obstacle-asteroid-small`).
   - perk `textureKey` from `perks.ts` (today: `perk-overdrive`, `perk-hardened`, `perk-emp`).
   - `bulletSprite` + `podSprite` from `weapons.json` — don't hard-code the set (it drifts every content change); derive it at run time: read each weapon's `bulletSprite`/`podSprite` from `weapons.json` and verify each value is generated in `BootScene.generateTextures()` or exists under `public/sprites/**`. (As of this writing: bullets `bullet-potato{,-idaho,-yukon}`, `bullet-pirate-{corsair,grapeshot,snare}`; pods `pod-{potato,pirate}` — illustrative, re-derive.)
   - hard-coded combat keys: `player-ship`, `bullet-friendly`, `bullet-hostile`, `powerup-{shield,credit,weapon}`, `particle-spark`.
   Pass if key is in `bootSceneKeys` OR a file at `public/sprites/**` matches it.
4. **Bullet/pod sprite orphan refs** — For each weapon with explicit `bulletSprite` / `podSprite`, verify generated in `BootScene.ts`. Default `bulletSprite` is `bullet-friendly`; `podSprite` is optional (omitted = invisible). Most common breakage today since every weapon ships a bespoke bullet sprite.
5. **Active-perk handler coverage** — `perks.ts` schema is `type: "active" | "passive"` (NOT `kind`). For every `type === "active"` id, confirm in `src/game/phaser/scenes/combat/PerkController.ts`: (a) a `case "<id>":` in `apply()` increments the resource, (b) `triggerActive()` consumes it. Also confirm `keydown-CTRL` in `CombatScene.ts` calls `perks.triggerActive()` (keybind lives outside PerkController).
6. **Behavior-string coverage** — Distinct `behavior` values in `enemies.json` (today: `straight`, `zigzag`, `homing`, `boss`) must each have a `case` in the `switch (def.behavior)` inside `Enemy.preUpdate` (`Enemy.ts`).
7. **Perk drop-weight sanity** — Current schema has NO `weight` field; `randomPerkId()` is uniform. Pass with note "uniform — N perks at 1/N each." If `weight` is added: each must be positive, sum > 0, flag any perk holding >80% of total.
8. **Mission prereq DAG** — Build `missionIds`. For each mission, every `requires[]` entry must resolve. DFS for cycles; flag the cycle path. Confirm ≥1 mission has `requires: []`. First three are vitest-covered; cycle check is NOT — re-run defensively.
9. **Loot-pool integrity** — For every `POOLS` entry in `lootPools.ts`:
   - `weapons[]` ids resolve to `WeaponId` (vs `weapons.json`).
   - `augments[]` ids resolve to `AugmentId` (vs `augments.ts` `AUGMENT_IDS`).
   - `upgrades[]` ∈ `{shield, armor, reactor-capacity, reactor-recharge}`.
   - `credits.min < credits.max`, both positive.
   - `systemId` resolves in `solarSystems.json`.
   - Tier gating: the `tutorial` pool is tier-1 only (per file header); flag a tier-2 / pirate weapon leaking in.
10. **Mission solarSystemId orphan check** — Every mission's `solarSystemId` resolves in `solarSystems.json`. Covered by the `every mission references a known solarSystemId` test in `data.test.ts`; surfaced for explicit coverage.
11. **Story integrity** — Parse `STORY_ENTRIES` in `story.ts`. Per entry:
    - `voiceTrack` resolves under `public/audio/story/` (e.g. `/audio/story/x-voice.mp3`).
    - If `musicTrack !== null`, file must exist (today only 2 of 9 entries carry music — re-derive).
    - `autoTrigger.kind === "on-mission-select"` → `missionId` resolves in `missions.json`.
    - `autoTrigger.kind` ∈ `{"on-system-enter", "on-system-cleared-idle"}` → `systemId` resolves in `solarSystems.json`.
    - Every member of the `StoryId` union in `story.ts` has an entry, and vice versa.
12. **storyTriggers helper coverage** — Re-derive the `StoryAutoTrigger` kinds from the `StoryAutoTrigger` union in `story.ts` (today, verify against `story.ts` and `storyTriggers.ts`: `first-time`, `on-mission-select`, `on-shop-open`, `on-system-enter`, `on-system-cleared-idle`, `on-all-cleared-idle`). Galaxy-view kinds need a matching `select*Entry` exported from `storyTriggers.ts` (today, re-derive: `selectFirstTimeEntry`, `selectOnSystemEnterEntry`, `selectOnMissionSelectEntry`, `selectReadyClearedIdleEntries`, `selectReadyAllClearedIdleEntries`). `on-shop-open` is the documented exception — fired by `src/components/hooks/useShopAudio.ts` (the dock-arrival voice hook, mounted at the ShopTabs level — see its on-shop-open effect ~L56-81). Flag any new galaxy-view kind without a helper.
13. **Music track refs** — For every mission with `musicTrack !== null`, check `public/<musicTrack>` exists; same for story `musicTrack`. Missing mission music = "no audio file yet (placeholder)" (soft) — list each missing path. Missing story voice file IS a hard fail (voice files exist today). Also check every `solarSystems.json` `galaxyMusicTrack` resolves under `public/audio/music/` — that file is REQUIRED (the menu/galaxy bed swaps to it on system enter via `MenuMusic.tsx`); missing IS a hard fail.

# Output format
Markdown report, this shape:

```markdown
# Content audit

## 1. Wave enemy refs
- ✓ pass — N spawns across M waves all resolve

## 3. Sprite-key coverage
- ✗ fail
  - `enemy-elite` referenced from `src/game/data/enemies.json:42` — no generator in `BootScene.ts`, no file in `public/sprites/`

## 13. Music track refs
- ⚠ note — mission tracks missing (placeholders): `/audio/music/boss-1.ogg`

…one `## N. <step name>` section per step 1–13, in order…

---

**Summary: FAIL (1 issue)**
```

`✓` pass, `✗` fail, `⚠` placeholder/note. Cite file paths + line numbers when fact lives at a specific line. End with `**Summary: PASS**` or `**Summary: FAIL (N issues)**` (N counts only `✗`; `⚠` doesn't count).

Today's totals (sanity baseline; verify via `grep -c '"id":' …` if diff suggests drift): **23 enemies, 1 obstacle, 6 weapons, 9 missions, 2 solar systems, 9 stories, 5 augments, 3 perks**.

# Constraints
- Read-only. Never edit/stage/commit.
- No `npm install`, no network. File-system inspection plus optional `npm test` if runnable.
- Don't invent fields. If schema lacks a field this skill describes (e.g. `shopWeapons`, perk `weight`), report "skipped — field not in current schema" rather than fabricating a failure.

## Freshness check

These checks assert the load-bearing files and symbols this audit reasons about still exist. Paths use `root = "scope_root"` (the Spacepotatis repo root) since this is a project-scope skill; the `no_broken_md_links` check defaults to this SKILL.md.

```toml
[[check]]
kind = "path_exists"
path = "src/game/data/enemies.json"
root = "scope_root"

[[check]]
kind = "file_contains"
path = "src/game/phaser/scenes/BootScene.ts"
pattern = "generateTextures"
root = "scope_root"

[[check]]
kind = "file_contains"
path = "src/game/phaser/scenes/combat/PerkController.ts"
pattern = "triggerActive"
root = "scope_root"

[[check]]
kind = "file_contains"
path = "src/game/phaser/entities/Enemy.ts"
pattern = "switch \\(def\\.behavior\\)"
root = "scope_root"

[[check]]
kind = "file_contains"
path = "src/game/data/storyTriggers.ts"
pattern = "export function select"
root = "scope_root"

[[check]]
kind = "no_broken_md_links"
```
