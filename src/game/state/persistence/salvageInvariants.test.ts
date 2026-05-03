import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { REMOVED_WEAPON_BASE_COSTS } from "./salvageRemovedWeapons";
import { WEAPON_IDS } from "@/game/data/weapons";

// Cross-check that the salvage map and the human-readable backlog stay in
// sync. The /equipment skill's REMOVE protocol requires both:
//   1. an entry in REMOVED_WEAPON_BASE_COSTS so the runtime can refund credits
//   2. a verbatim spec under TODO.md "Phase Vegetable-Catalog" so the weapon
//      can be reintroduced cleanly later
// If a future PR removes a weapon without doing (1), this test surfaces it
// as soon as the backlog is updated. (It cannot catch a removal that ALSO
// skips the backlog — but that PR will fail content-audit / review for
// other reasons. Belt + suspenders.)

describe("REMOVED_WEAPON_BASE_COSTS — invariants", () => {
  it("contains no id that is currently live in WEAPON_IDS (graveyard, not registry)", () => {
    const live = new Set<string>(WEAPON_IDS);
    const overlapping = Object.keys(REMOVED_WEAPON_BASE_COSTS).filter((id) =>
      live.has(id)
    );
    expect(
      overlapping,
      `REMOVED_WEAPON_BASE_COSTS holds ids that are still in WEAPON_IDS — `
        + `salvage will never refund them and the entry is misleading. `
        + `Either drop the entry or remove the id from the catalog.`
    ).toEqual([]);
  });

  it("base costs are all positive integers (no typos like 0 or NaN)", () => {
    for (const [id, cost] of Object.entries(REMOVED_WEAPON_BASE_COSTS)) {
      expect(Number.isFinite(cost), `${id}: cost must be finite`).toBe(true);
      expect(cost, `${id}: cost must be > 0 (was ${cost})`).toBeGreaterThan(0);
      expect(Number.isInteger(cost), `${id}: cost must be an integer`).toBe(true);
    }
  });

  it("every id documented in TODO.md 'Phase Vegetable-Catalog' backlog has a refund entry", () => {
    // Read TODO.md from the repo root. The vitest cwd is the package root,
    // so resolve relative to that. If this file gets moved, update the path.
    const todoPath = resolve(process.cwd(), "TODO.md");
    const todo = readFileSync(todoPath, "utf-8");

    const phaseHeader = "Phase Vegetable-Catalog";
    const phaseStart = todo.indexOf(phaseHeader);
    if (phaseStart < 0) {
      // Backlog phase has been retired — nothing to check. The salvage map
      // can outlive the backlog (and should, per the file's own header).
      return;
    }
    // Bound the section: stop at the next top-level "- **" bullet that
    // looks like a separate phase, or at the next "## " heading. The
    // vegetable-catalog block is contiguous in TODO.md.
    const phaseEnd = todo.indexOf("\n## ", phaseStart);
    const slice = phaseEnd > 0 ? todo.slice(phaseStart, phaseEnd) : todo.slice(phaseStart);

    // Match the bullet leader pattern: `  - **\`<id>\`**`. The skill's
    // template generates exactly this shape, and the parser stays narrow
    // so a stray "- **`some-other-thing`**" outside the backlog table
    // doesn't get mistaken for a weapon id.
    const idPattern = /^ {2}- \*\*`([a-z][a-z0-9-]+)`\*\*/gm;
    const documentedIds = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = idPattern.exec(slice)) !== null) {
      const id = match[1];
      if (id) documentedIds.add(id);
    }

    expect(documentedIds.size, "expected at least one id under Phase Vegetable-Catalog").toBeGreaterThan(0);

    const missing = [...documentedIds].filter((id) => !(id in REMOVED_WEAPON_BASE_COSTS));
    expect(
      missing,
      `TODO.md backlog lists removed weapons that are NOT in REMOVED_WEAPON_BASE_COSTS: ${missing.join(", ")}. `
        + `Add an entry to salvageRemovedWeapons.ts so players who owned them get refunded on next hydrate.`
    ).toEqual([]);
  });
});
