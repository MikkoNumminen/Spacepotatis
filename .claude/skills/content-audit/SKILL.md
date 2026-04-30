---
name: content-audit
description: Pre-commit content invariants check — orphan refs (enemy / weapon / sprite / pod / loot-pool / mission system / story trigger), missing sprite generators, perk drop-weight sanity, mission prereq DAG, story integrity (voice + music files, trigger refs), storyTriggers helper coverage.
---

# When to use
Invoke on `/content-audit`, "is the content safe to commit," or before a PR touching `src/game/data/`, `src/game/data/story.ts`, `src/game/data/storyTriggers.ts`, `src/game/data/lootPools.ts`, `src/game/data/augments.ts`, `src/game/phaser/scenes/BootScene.ts`, `src/game/phaser/scenes/CombatScene.ts`, `src/game/phaser/entities/Enemy.ts`, or `public/`. Read-only — never modify any file.

# Steps (the audit checklist)
1. **Smoke check (covered by vitest)** — Build `enemyIds = Set(enemies[].id)` from `enemies.json`; for every `missions[].waves[].spawns[].enemy` in `waves.json`, verify membership. Covered by `data.test.ts` — re-report so a skipped-test run still flags drift.
2. **Orphan weapon refs in shop entries** — From `weapons.json` build `weaponIds`. In `missions.json`, for every `kind: "shop"` mission scan any weapon-listing field (`shopWeapons`, `inventory`, …). If absent on every shop, report "no shop weapon list yet — skipped" (today's shop sources inventory dynamically via `lootPools.ts` — see step 9). Otherwise verify each id.
3. **Sprite-key coverage** — Grep `BootScene.generateTextures()` for the first arg of every `draw*("key", …)` to build `bootSceneKeys`. Required keys:
   - `enemy.spriteKey` from `enemies.json` (today: 16 — `enemy-aphid{,-giant,-queen,-empress}`, `enemy-beetle-{scarab,rhino,stag}`, `enemy-caterpillar-{hornworm,army,monarch}`, `enemy-spider-{wolf,widow,jumper}`, `enemy-dragonfly-{common,heli,damsel}`).
   - perk `textureKey` from `perks.ts` (today: `perk-overdrive`, `perk-hardened`, `perk-emp`).
   - `bulletSprite` + `podSprite` from `weapons.json` (today bullets: `bullet-potato{,-idaho,-yukon,-redbliss}`, `bullet-carrot-{chantenay,imperator,nantes}`, `bullet-turnip-{tokyo,milan}`; pods: `pod-{potato,carrot,turnip}`).
   - hard-coded combat keys: `player-ship`, `bullet-friendly`, `bullet-hostile`, `powerup-{shield,credit,weapon}`, `particle-spark`.
   Pass if key is in `bootSceneKeys` OR a file at `public/sprites/**` matches it.
4. **Bullet/pod sprite orphan refs** — For each weapon with explicit `bulletSprite` / `podSprite`, verify generated in `BootScene.ts`. Default `bulletSprite` is `bullet-friendly`; `podSprite` is optional (omitted = invisible). Most common breakage today since every weapon ships a bespoke bullet sprite.
5. **Active-perk handler coverage** — `perks.ts` schema is `type: "active" | "passive"` (NOT `kind`). For every `type === "active"` id, confirm in `src/game/phaser/scenes/combat/PerkController.ts`: (a) a `case "<id>":` in `apply()` increments the resource, (b) `triggerActive()` consumes it. Also confirm `keydown-CTRL` in `CombatScene.ts` calls `perks.triggerActive()` (keybind lives outside PerkController).
6. **Behavior-string coverage** — Distinct `behavior` values in `enemies.json` (today: `straight`, `zigzag`, `homing`, `boss`) must each have a `case` in `Enemy.preUpdate`'s `switch (def.behavior)` (around `Enemy.ts:105-126`).
7. **Perk drop-weight sanity** — Current schema has NO `weight` field; `randomPerkId()` is uniform. Pass with note "uniform — N perks at 1/N each." If `weight` is added: each must be positive, sum > 0, flag any perk holding >80% of total.
8. **Mission prereq DAG** — Build `missionIds`. For each mission, every `requires[]` entry must resolve. DFS for cycles; flag the cycle path. Confirm ≥1 mission has `requires: []`. First three are vitest-covered; cycle check is NOT — re-run defensively.
9. **Loot-pool integrity** — For every `POOLS` entry in `lootPools.ts`:
   - `weapons[]` ids resolve to `WeaponId` (vs `weapons.json`).
   - `augments[]` ids resolve to `AugmentId` (vs `augments.ts` `AUGMENT_IDS`).
   - `upgrades[]` ∈ `{shield, armor, reactor-capacity, reactor-recharge}`.
   - `credits.min < credits.max`, both positive.
   - `systemId` resolves in `solarSystems.json`.
   - Family gating: `tutorial` pool is potato-family only (per file header); flag carrot/turnip leaks.
10. **Mission solarSystemId orphan check** — Every mission's `solarSystemId` resolves in `solarSystems.json`. Covered by `data.test.ts:159-166`; surfaced for explicit coverage.
11. **Story integrity** — Parse `STORY_ENTRIES` in `story.ts`. Per entry:
    - `voiceTrack` resolves under `public/audio/story/` (e.g. `/audio/story/x-voice.mp3`).
    - If `musicTrack !== null`, file must exist (most modal entries reuse `/audio/story/great-potato-awakening-music.ogg`).
    - `autoTrigger.kind === "on-mission-select"` → `missionId` resolves in `missions.json`.
    - `autoTrigger.kind` ∈ `{"on-system-enter", "on-system-cleared-idle"}` → `systemId` resolves in `solarSystems.json`.
    - Every `StoryId` union member (`story.ts:37-44`) has an entry, and vice versa.
12. **storyTriggers helper coverage** — `StoryAutoTrigger` kinds (`story.ts:46-56`): `first-time`, `on-mission-select`, `on-shop-open`, `on-system-enter`, `on-system-cleared-idle`. Galaxy-view kinds need a matching `select*Entry` exported from `storyTriggers.ts` (today: `selectFirstTimeEntry`, `selectOnSystemEnterEntry`, `selectOnMissionSelectEntry`, `selectReadyClearedIdleEntries`). `on-shop-open` is the documented exception — fired inline by `src/components/ShopUI.tsx` (see comment at `useStoryTriggers.ts:29`). Flag any new galaxy-view kind without a helper.
13. **Music track refs** — For every mission with `musicTrack !== null`, check `public/<musicTrack>` exists; same for story `musicTrack`. Missing music = "no audio file yet (placeholder)" (soft) — `public/audio/music/` is empty by design — but list each missing path. Missing story voice file IS a hard fail (voice files exist today).

# Invariants this skill enforces
- Every `spawn.enemy` resolves (re-asserted from vitest).
- Every shop-listed weapon id (when field exists) resolves.
- Every sprite/texture key — including `bulletSprite` / `podSprite` — has a generator in `BootScene.ts` or a file in `public/sprites/`.
- Every active perk has both an `apply()` case and a `triggerActive()` consumer in `PerkController`, plus a `CombatScene` keybind.
- Every enemy `behavior` has a `case` in `Enemy.preUpdate`.
- Perk drop weights (when present) are positive and not pathologically skewed.
- Mission `requires[]` is acyclic, references known ids, has ≥1 entry-point.
- Every loot-pool weapon/augment/upgrade id resolves; `credits.min < credits.max`; tutorial pool is potato-only.
- Every mission `solarSystemId` resolves.
- Every story entry's `voiceTrack` resolves; `musicTrack` (when not null) resolves; trigger `missionId`/`systemId` references resolve.
- `STORY_ENTRIES` ↔ `StoryId` union in sync.
- Every galaxy-view `StoryAutoTrigger.kind` has a `select*Entry` helper.
- Music tracks resolve or are flagged as known placeholders.

# Output format
Markdown report, this shape:

```markdown
# Content audit

## 1. Wave enemy refs
- ✓ pass — N spawns across M waves all resolve

## 2. Shop weapon refs
- ✓ pass — no shop weapon list yet (sourced from lootPools.ts at runtime)

## 3. Sprite-key coverage
- ✗ fail
  - `enemy-elite` referenced from `src/game/data/enemies.json:42` — no generator in `BootScene.ts`, no file in `public/sprites/`

## 4. Bullet / pod sprite refs
- ✓ pass — 9/9 bulletSprite + 3/3 podSprite values generated

## 5. Active-perk handlers
- ✓ pass — emp handled in apply + triggerActive

## 6. Behavior coverage
- ✓ pass — straight, zigzag, homing, boss

## 7. Perk drop weights
- ✓ pass — uniform, 3 perks at 33.3%

## 8. Mission prereq DAG
- ✗ fail
  - cycle: `combat-1 → boss-1 → combat-1`

## 9. Loot-pool integrity
- ✓ pass — 2 pools; 7 weapon + 9 augment + 8 upgrade refs resolve; credits valid

## 10. Mission solarSystemId refs
- ✓ pass — 9/9 resolve

## 11. Story integrity
- ⚠ note — 7 entries match StoryId union; all voiceTracks resolve; 1 musicTrack missing: `/audio/story/spud-prime-arrival-music.ogg`

## 12. storyTriggers helper coverage
- ✓ pass — 4 galaxy-view kinds have helpers; `on-shop-open` fired inline from ShopUI.tsx

## 13. Music track refs
- ⚠ note — 4/9 mission tracks missing (placeholders)
  - `/audio/music/combat-1.ogg`
  - `/audio/music/boss-1.ogg`

---

**Summary: FAIL (2 issues)**
```

`✓` pass, `✗` fail, `⚠` placeholder/note. Cite file paths + line numbers when fact lives at a specific line. End with `**Summary: PASS**` or `**Summary: FAIL (N issues)**` (N counts only `✗`; `⚠` doesn't count).

Today's totals (sanity baseline; verify via `grep -c '"id":' …` if diff suggests drift): **16 enemies, 9 weapons, 9 missions, 2 solar systems, 7 stories, 5 augments, 3 perks**.

# Constraints
- Read-only. Never edit/stage/commit.
- No `npm install`, no network. File-system inspection plus optional `npm test` if runnable.
- Don't invent fields. If schema lacks a field this skill describes (e.g. `shopWeapons`, perk `weight`), report "skipped — field not in current schema" rather than fabricating a failure.
