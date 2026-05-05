"use client";

import type { ShipConfig } from "@/game/state/ShipConfig";
import { Bar } from "./Bar";
import { getEquippedEntries } from "./selectors";
import { dpsOf } from "./weaponStats";

// Vertical-bar strip showing each equipped weapon's DPS contribution
// plus a TOTAL chip on the header row. Lives at the top of the GARAGE
// tab inside LoadoutMenu, above the EQUIPPED list.
//
// v1 scope (per the 2026-05-05 backlog):
//  - Empty slots are HIDDEN (the slot count is already visible in
//    SlotGrid above; padding the graph with zero-height placeholders
//    just adds noise).
//  - No augment-picker before/after projection (defer — doubles
//    complexity for marginal value).
//  - No energy-cost overlay (DPS-per-energy is a future add).
//  - Weapons-only (no shield/armor/reactor — those are a separate
//    ship-summary card if/when wanted).
//
// Returns null when no weapons are equipped at all (rare — only happens
// after slot purchase before equipping). The header chip would read
// "TOTAL 0" with no bars, which adds noise; cleaner to hide entirely.
export function LoadoutDpsGraph({ ship }: { ship: ShipConfig }) {
  const equipped = getEquippedEntries(ship);
  if (equipped.length === 0) return null;

  // Pre-compute DPS once per render so we can size bars from a shared
  // max + sum the total in one pass.
  const bars = equipped.map((entry) => ({
    key: entry.key,
    label: entry.slotBadge,
    tint: entry.weapon.tint,
    dps: dpsOf(entry.weapon, entry.instance.level, entry.instance.augments)
  }));
  const total = bars.reduce((sum, b) => sum + b.dps, 0);
  // Bars share a max so the visual ratio mirrors the value ratio. A 5%
  // headroom keeps the tallest bar from kissing the frame top — same
  // approach as AugmentDetailsModal's ImpactDiagram. Floor at 1 so a
  // ship with all weapons at zero DPS doesn't divide by zero.
  const max = Math.max(...bars.map((b) => b.dps), 1) * 1.05;

  return (
    <div className="mt-3 mb-4 rounded border border-space-border bg-space-bg/40 p-3">
      <div className="mb-3 flex items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-hud-green/60">
        <span>Loadout DPS</span>
        <span className="font-mono text-[11px] text-hud-amber">
          TOTAL {total}
        </span>
      </div>
      <div className="flex flex-wrap items-end justify-center gap-4">
        {bars.map((b) => (
          <Bar
            key={b.key}
            value={b.dps}
            unit=""
            pct={(b.dps / max) * 100}
            caption={b.label}
            tint={b.tint}
          />
        ))}
      </div>
    </div>
  );
}
