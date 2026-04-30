---
name: content-audit
description: Pre-commit content invariants check — orphan refs (enemy / weapon / sprite / pod / loot-pool / mission system / story trigger), missing sprite generators, perk drop-weight sanity, mission prereq DAG, story integrity (voice + music files, trigger refs), storyTriggers helper coverage.
---

# When to use
Invoke when the user runs `/content-audit`, asks "is the content safe to commit," or before opening a PR that touches `src/game/data/`, `src/game/data/story.ts`, `src/game/data/storyTriggers.ts`, `src/game/data/lootPools.ts`, `src/game/data/augments.ts`, `src/game/phaser/scenes/BootScene.ts`, `src/game/phaser/scenes/CombatScene.ts`, `src/game/phaser/entities/Enemy.ts`, or `public/`. Read-only — never modify any file.

# Steps (the audit checklist)
1. **Smoke check (covered by vitest)** — Parse `src/game/data/enemies.json` and `waves.json`. Build `enemyIds = Set(enemies[].id)`. For every `missions[].waves[].spawns[].enemy` in waves.json, verify membership. Already covered by `data.test.ts`; report as smoke check so a fresh run still flags drift if tests were skipped.
2. **Orphan weapon refs in shop entries** — Read `src/game/data/weapons.json` for `weaponIds`. Read `src/game/data/missions.json`; for every mission with `kind: "shop"`, scan any field that names weapons (`shopWeapons`, `inventory`, or similar). The MVP shop schema may not yet list weapons explicitly — if the field is absent on every shop mission, report "no shop weapon list yet — skipped." Otherwise verify each id exists in `weaponIds` and flag misses. (Today the shop sources its inventory dynamically via `lootPools.ts` per system — see step 9.)
3. **Sprite-key coverage** — The recommended audit method is to grep BootScene's `generateTextures()` for every string passed as the first argument (every `draw*("key", …)` call), build that as `bootSceneKeys`, then verify every required key resolves. Required keys come from:
   - All `enemy.spriteKey` values in `enemies.json` (today: 16 enemies — `enemy-aphid`, `enemy-aphid-giant`, `enemy-aphid-queen`, `enemy-aphid-empress`, `enemy-beetle-{scarab,rhino,stag}`, `enemy-caterpillar-{hornworm,army,monarch}`, `enemy-spider-{wolf,widow,jumper}`, `enemy-dragonfly-{common,heli,damsel}`).
   - All perk `textureKey` values in `perks.ts` (today: `perk-overdrive`, `perk-hardened`, `perk-emp`).
   - All weapon `bulletSprite` and `podSprite` values in `weapons.json` (today's bullet sprites: `bullet-potato`, `bullet-potato-idaho`, `bullet-potato-yukon`, `bullet-potato-redbliss`, `bullet-carrot-chantenay`, `bullet-carrot-imperator`, `bullet-carrot-nantes`, `bullet-turnip-tokyo`, `bullet-turnip-milan`; pod sprites: `pod-potato`, `pod-carrot`, `pod-turnip`).
   - Implicit hard-coded keys used by combat code: `player-ship`, `bullet-friendly`, `bullet-hostile`, `powerup-shield`, `powerup-credit`, `powerup-weapon`, `particle-spark`.
   For each required key: pass if it appears in `bootSceneKeys`, OR an asset exists under `public/sprites/**` matching the key. Flag missing.
4. **Bullet/pod sprite orphan refs** — For each weapon in `weapons.json` whose entry declares `bulletSprite` or `podSprite`, verify the texture key is generated in `BootScene.ts`. Default fallback is `bullet-friendly` when `bulletSprite` is absent; `podSprite` is optional (omitted = invisible pod). Flag any explicit value that doesn't resolve. (This vector didn't exist when the skill was first written and is the most common breakage today since every weapon now has a bespoke bullet sprite.)
5. **Active-perk handler coverage** — Parse `src/game/data/perks.ts` (note: schema uses `type: "active" | "passive"`, NOT `kind`). Collect every `id` whose `type === "active"`. Open `src/game/phaser/scenes/combat/PerkController.ts` and locate `apply()` (the gain-side switch) plus `triggerActive()` (the consume-side dispatch). For each active perk id, verify both: (a) a `case "<id>":` exists in `apply()` that increments the relevant resource (e.g. `empCharges += 1`) and (b) `triggerActive()` has logic that consumes that resource and runs the effect. Also confirm the `keydown-CTRL` handler in `src/game/phaser/scenes/CombatScene.ts` calls `perks.triggerActive()` (the keybind itself lives outside PerkController). Flag any active perk with no consumer.
6. **Behavior-string coverage** — Collect every distinct `behavior` value from `enemies.json` (today: `straight`, `zigzag`, `homing`, `boss`). Open `src/game/phaser/entities/Enemy.ts` and confirm every value appears as a `case "<behavior>":` inside `preUpdate`'s `switch (def.behavior)` (today's matches live near `Enemy.ts:105-126`). Flag missing.
7. **Perk drop-weight sanity** — Open `perks.ts`. The current schema has NO `weight` field; `randomPerkId()` is uniform over `PERK_IDS`. Pass with note "uniform distribution — N perks at 1/N each." If a `weight` field has been added: every weight must be a positive number; sum > 0; flag any single perk holding > 80% of total (allowed but worth a human eyeball).
8. **Mission prereq DAG** — Parse `missions.json`. Build `missionIds = Set(missions[].id)`. For each mission, verify every entry in `requires[]` resolves to a known id (no orphans). Build a directed graph and run DFS/topological sort to detect cycles. Flag the cycle path if found. Confirm at least one mission has `requires: []` (entry point). The first three are also covered by vitest — re-run them defensively, then add the cycle check (vitest does NOT cover cycles).
9. **Loot-pool integrity** — Parse `src/game/data/lootPools.ts`. For every entry in `POOLS`:
   - Every `weapons[]` id must resolve to a known `WeaponId` (cross-reference `weapons.json`).
   - Every `augments[]` id must resolve to a known `AugmentId` (cross-reference `augments.ts` `AUGMENT_IDS`).
   - Every `upgrades[]` value must be a valid `UpgradeField` (`shield` | `armor` | `reactor-capacity` | `reactor-recharge`).
   - `credits.min < credits.max` and both are positive.
   - The `systemId` must resolve to a known `SolarSystemId` in `solarSystems.json`.
   - Family-gating sanity: the `tutorial` pool should be potato-family weapons only (per the file's header comment); flag any carrot/turnip leaking in.
10. **Mission solarSystemId orphan check** — For every mission in `missions.json`, verify `solarSystemId` resolves to a known id in `solarSystems.json`. Already covered by `data.test.ts:159-166`; surface here so the audit's coverage is explicit.
11. **Story integrity** — Parse `src/game/data/story.ts` (read as text; locate the `STORY_ENTRIES` literal). For every entry:
    - `voiceTrack` must point at an existing file under `public/audio/story/` (e.g. `/audio/story/foo-voice.mp3` resolves to `public/audio/story/foo-voice.mp3`).
    - If `musicTrack !== null`, the file must exist (today most modal entries reuse `/audio/story/great-potato-awakening-music.ogg`).
    - For `autoTrigger.kind === "on-mission-select"`, the `missionId` must resolve to a known mission id in `missions.json`.
    - For `autoTrigger.kind === "on-system-enter"` or `"on-system-cleared-idle"`, the `systemId` must resolve to a known system id in `solarSystems.json`.
    - Every member of the `StoryId` union (line 37–44 of `story.ts`) must have a matching entry in `STORY_ENTRIES` (and vice versa).
12. **storyTriggers helper coverage** — Open `src/game/data/storyTriggers.ts`. Today's `StoryAutoTrigger` kinds are `first-time`, `on-mission-select`, `on-shop-open`, `on-system-enter`, `on-system-cleared-idle` (see `story.ts:46-56`). Galaxy-view kinds must each have a matching `select*Entry` exported from `storyTriggers.ts` — currently `selectFirstTimeEntry`, `selectOnSystemEnterEntry`, `selectOnMissionSelectEntry`, `selectReadyClearedIdleEntries`. The `on-shop-open` kind is the documented exception and is fired inline by `src/components/ShopUI.tsx` (see the comment in `useStoryTriggers.ts` line 29). Flag any new galaxy-view kind that lacks a helper, since the firing site (`useStoryTriggers`) would have nothing to call.
13. **Music track refs** — For every mission with `musicTrack !== null`, check `public/<musicTrack>` exists. Same for any story `musicTrack`. If missing, report as "no audio file yet (placeholder)" rather than a hard fail — assets under `public/audio/music/` are currently empty by design — but list every missing path so the user can see the gap. Note: story voice files DO exist today under `public/audio/story/`, so a missing voice file IS a real fail.

# Invariants this skill enforces
- Every `spawn.enemy` resolves to a real enemy id (re-asserted from vitest).
- Every shop-listed weapon id (when the field exists) resolves to a real weapon.
- Every sprite/texture key referenced from data — including weapon `bulletSprite` / `podSprite` — has a procedural generator in `BootScene.ts` or a real file under `public/sprites/`.
- Every active perk has both a pickup handler (`apply()` case) and a consumer (`triggerActive()` branch) in `PerkController`, plus a keybind in `CombatScene` that calls `triggerActive()`.
- Every enemy `behavior` value has a matching `case` in `Enemy.preUpdate`.
- Perk drop weights (when present) are positive and not pathologically skewed.
- Mission `requires[]` is acyclic, references only known ids, and has at least one entry-point mission.
- Every loot-pool weapon / augment / upgrade id resolves to its respective union; `credits.min < credits.max`; tutorial pool is potato-only.
- Every mission `solarSystemId` resolves to a known solar system.
- Every story entry's `voiceTrack` resolves to a real mp3; `musicTrack` (when not null) resolves to a real file; trigger `missionId` / `systemId` references resolve.
- `STORY_ENTRIES` and the `StoryId` union are in sync.
- Every `StoryAutoTrigger.kind` in the galaxy view has a matching `select*Entry` helper in `storyTriggers.ts`.
- Music tracks either resolve to a real file or are flagged as known placeholders.

# Output format
Markdown report, exactly this shape:

```markdown
# Content audit

## 1. Wave enemy refs
- ✓ pass — N spawns across M waves all resolve

## 2. Shop weapon refs
- ✓ pass — no shop weapon list yet (sourced from lootPools.ts at runtime)

## 3. Sprite-key coverage
- ✗ fail
  - `enemy-elite` referenced from `src/game/data/enemies.json:42` — no generator in `BootScene.ts`, no file under `public/sprites/`

## 4. Bullet / pod sprite refs
- ✓ pass — 9/9 bulletSprite + 3/3 podSprite values generated in BootScene

## 5. Active-perk handlers
- ✓ pass — emp handled in `PerkController.apply` and consumed in `PerkController.triggerActive`

## 6. Behavior coverage
- ✓ pass — straight, zigzag, homing, boss (the four supported by Enemy.preUpdate)

## 7. Perk drop weights
- ✓ pass — uniform distribution, 3 perks at 33.3% each

## 8. Mission prereq DAG
- ✗ fail
  - cycle: `combat-1 → boss-1 → combat-1` in `src/game/data/missions.json`

## 9. Loot-pool integrity
- ✓ pass — 2 pools (tutorial, tubernovae); 7 weapon refs + 9 augment refs + 8 upgrade refs all resolve; credits ranges valid

## 10. Mission solarSystemId refs
- ✓ pass — 9/9 missions point at known systems (tutorial, tubernovae)

## 11. Story integrity
- ⚠ note
  - 7 entries in `STORY_ENTRIES` match the StoryId union; all voiceTracks resolve
  - 1 musicTrack missing: `/audio/story/spud-prime-arrival-music.ogg` (placeholder)

## 12. storyTriggers helper coverage
- ✓ pass — 4 galaxy-view kinds (`first-time`, `on-mission-select`, `on-system-enter`, `on-system-cleared-idle`) all have select*Entry helpers; `on-shop-open` is fired inline from ShopUI.tsx

## 13. Music track refs
- ⚠ note — 4/9 mission tracks missing under `public/audio/music/` (known placeholders)
  - `/audio/music/combat-1.ogg` (mission `combat-1`)
  - `/audio/music/boss-1.ogg` (mission `boss-1`)

---

**Summary: FAIL (2 issues)**
```

Use `✓` for pass, `✗` for fail, `⚠` for placeholder/note. Always cite file paths (absolute or repo-relative) and a line number when the fact lives at a specific line. End with `**Summary: PASS**` or `**Summary: FAIL (N issues)**` where N counts only `✗` items (`⚠` notes don't count).

Today's content totals (use these as a sanity baseline; verify against `grep -c '"id":' …` if the diff suggests they've moved): **16 enemies, 9 weapons, 9 missions, 2 solar systems, 7 stories, 5 augments, 3 perks**.

# Constraints
- Read-only. Never edit, stage, or commit any file.
- No `npm install`, no network. Pure file-system inspection plus optional `npm test` if already runnable.
- Do not invent fields. If the actual schema lacks a field this skill describes (e.g. `shopWeapons`, perk `weight`), report "skipped — field not in current schema" rather than fabricating a failure.
