---
name: content-audit
description: Pre-commit content invariants check — orphan refs, missing sprite generators, perk drop-weight sanity, mission prereq DAG.
---

# When to use
Invoke when the user runs `/content-audit`, asks "is the content safe to commit," or before opening a PR that touches `src/game/data/`, `src/game/phaser/scenes/BootScene.ts`, `src/game/phaser/scenes/CombatScene.ts`, `src/game/phaser/entities/Enemy.ts`, or `public/`. Read-only — never modify any file.

# Steps (the audit checklist)
1. **Smoke check (covered by vitest)** — Parse `src/game/data/enemies.json` and `waves.json`. Build `enemyIds = Set(enemies[].id)`. For every `missions[].waves[].spawns[].enemy` in waves.json, verify membership. Already covered by `data.test.ts`; report as smoke check so a fresh run still flags drift if tests were skipped.
2. **Orphan weapon refs in shop entries** — Read `src/game/data/weapons.json` for `weaponIds`. Read `src/game/data/missions.json`; for every mission with `kind: "shop"`, scan any field that names weapons (`shopWeapons`, `inventory`, or similar). The MVP shop schema may not yet list weapons explicitly — if the field is absent on every shop mission, report "no shop weapon list yet — skipped." Otherwise verify each id exists in `weaponIds` and flag misses.
3. **Sprite-key coverage** — Collect every `spriteKey` from `enemies.json`, every `textureKey` from `perks.ts`, plus implicit keys used by code (`player-ship`, `bullet-friendly`, `bullet-hostile`, `powerup-shield`, `powerup-credit`, `powerup-weapon`, `particle-spark`). Read `BootScene.ts` and extract every string passed as the first arg to the enemy helpers (`drawAphid`, `drawBeetle`, `drawCaterpillar`, `drawSpider`, `drawDragonfly`), the bullet helper (`drawBullet`), the player helper (`drawPotatoShip`), the pickup helpers (`drawPotatoPowerUp`, `drawMissionPerk`), and the particle helper (`drawSpark`), plus any `generateTexture(key, …)`. For each required key: pass if it appears in BootScene, OR an asset exists under `public/sprites/**` matching the key. Flag missing.
4. **Active-perk handler coverage** — Parse `src/game/data/perks.ts` (note: schema uses `type: "active" | "passive"`, NOT `kind`). Collect every `id` whose `type === "active"`. Open `src/game/phaser/scenes/combat/PerkController.ts` and locate `apply()` (the gain-side switch) plus `triggerActive()` (the consume-side dispatch). For each active perk id, verify both: (a) a `case "<id>":` exists in `apply()` that increments the relevant resource (e.g. `empCharges += 1`) and (b) `triggerActive()` has logic that consumes that resource and runs the effect. Also confirm the `keydown-CTRL` handler in `src/game/phaser/scenes/CombatScene.ts` calls `perks.triggerActive()` (the keybind itself lives outside PerkController). Flag any active perk with no consumer.
5. **Behavior-string coverage** — Collect every distinct `behavior` value from `enemies.json`. Open `src/game/phaser/entities/Enemy.ts` and confirm every value appears as a `case "<behavior>":` inside `preUpdate`'s `switch (def.behavior)`. Flag missing.
6. **Perk drop-weight sanity** — Open `perks.ts`. The current schema has NO `weight` field; `randomPerkId()` is uniform over `PERK_IDS`. Pass with note "uniform distribution — N perks at 1/N each." If a `weight` field has been added: every weight must be a positive number; sum > 0; flag any single perk holding > 80% of total (allowed but worth a human eyeball).
7. **Mission prereq DAG** — Parse `missions.json`. Build `missionIds = Set(missions[].id)`. For each mission, verify every entry in `requires[]` resolves to a known id (no orphans). Build a directed graph and run DFS/topological sort to detect cycles. Flag the cycle path if found. Confirm at least one mission has `requires: []` (entry point). The first three are also covered by vitest — re-run them defensively, then add the cycle check (vitest does NOT cover cycles).
8. **Music track refs** — For every mission with `musicTrack !== null`, check `public/<musicTrack>` exists. If missing, report as "no audio file yet (placeholder)" rather than a hard fail — assets under `public/audio/` are currently empty by design — but list every missing path so the user can see the gap.

# Invariants this skill enforces
- Every `spawn.enemy` resolves to a real enemy id (re-asserted from vitest).
- Every shop-listed weapon id (when the field exists) resolves to a real weapon.
- Every sprite/texture key referenced from data has a procedural generator in `BootScene.ts` or a real file under `public/sprites/`.
- Every active perk has both a pickup handler (`apply()` case) and a consumer (`triggerActive()` branch) in `PerkController`, plus a keybind in `CombatScene` that calls `triggerActive()`.
- Every enemy `behavior` value has a matching `case` in `Enemy.preUpdate`.
- Perk drop weights (when present) are positive and not pathologically skewed.
- Mission `requires[]` is acyclic, references only known ids, and has at least one entry-point mission.
- Music tracks either resolve to a real file or are flagged as known placeholders.

# Output format
Markdown report, exactly this shape:

```markdown
# Content audit

## 1. Wave enemy refs
- ✓ pass — N spawns across M waves all resolve

## 2. Shop weapon refs
- ✓ pass — no shop weapon list yet (skipped)

## 3. Sprite-key coverage
- ✗ fail
  - `enemy-elite` referenced from `src/game/data/enemies.json:42` — no generator in `BootScene.ts`, no file under `public/sprites/`

## 4. Active-perk handlers
- ✓ pass — emp handled in `PerkController.apply` and consumed in `PerkController.triggerActive`

## 5. Behavior coverage
- ✓ pass — straight, zigzag, homing, boss (the four supported by Enemy.preUpdate)

## 6. Perk drop weights
- ✓ pass — uniform distribution, 3 perks at 33.3% each

## 7. Mission prereq DAG
- ✗ fail
  - cycle: `combat-2 → boss-1 → combat-2` in `src/game/data/missions.json`

## 8. Music track refs
- ⚠ note — 4/4 tracks missing under `public/audio/music/` (known placeholders)
  - `/audio/music/combat-tutorial.ogg` (mission `tutorial`)
  - `/audio/music/combat-1.ogg` (mission `combat-1`)
  - `/audio/music/boss-1.ogg` (mission `boss-1`)

---

**Summary: FAIL (2 issues)**
```

Use `✓` for pass, `✗` for fail, `⚠` for placeholder/note. Always cite file paths (absolute or repo-relative) and a line number when the fact lives at a specific line. End with `**Summary: PASS**` or `**Summary: FAIL (N issues)**` where N counts only `✗` items (`⚠` notes don't count).

# Constraints
- Read-only. Never edit, stage, or commit any file.
- No `npm install`, no network. Pure file-system inspection plus optional `npm test` if already runnable.
- Do not invent fields. If the actual schema lacks a field this skill describes (e.g. `shopWeapons`, perk `weight`), report "skipped — field not in current schema" rather than fabricating a failure.
