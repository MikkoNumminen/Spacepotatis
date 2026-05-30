"use client";

import type { ShipConfig } from "@/game/state";
import type { WeaponDefinition, WeaponId } from "@/types";
import { WeaponDot } from "@/components/loadout/dots";
import { CatalogSection } from "@/components/ui/CatalogSection";

// Total copies of a weapon id the player owns across slots + inventory.
// Used to decorate buy rows so the player can see "owned · N" before purchase.
function countOwnedWeapon(ship: ShipConfig, id: WeaponId): number {
  let n = 0;
  for (const slot of ship.slots) if (slot?.id === id) n++;
  for (const inst of ship.inventory) if (inst.id === id) n++;
  return n;
}

function TierBadge({ tier }: { tier: 1 | 2 }) {
  const cls =
    tier === 1
      ? "border-hud-green/40 text-hud-green/70"
      : "border-hud-amber/50 text-hud-amber/80";
  const title = tier === 1
    ? "Tier 1 — starter / potato-family weapons. Always sold in tutorial-system shops."
    : "Tier 2 — pirate-haul weapons. Only available in shops past the tutorial system.";
  return (
    <span
      aria-label={`Tier ${tier}`}
      title={title}
      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${cls}`}
    >
      T{tier}
    </span>
  );
}

export function ShopWeaponsSection({
  ship,
  credits,
  visibleWeapons,
  onBuyWeapon,
  onShowWeaponDetails
}: {
  ship: ShipConfig;
  credits: number;
  visibleWeapons: readonly WeaponDefinition[];
  onBuyWeapon: (weapon: WeaponDefinition) => void;
  onShowWeaponDetails: (weapon: WeaponDefinition) => void;
}) {
  return (
    <CatalogSection title="BUY WEAPONS">
      {visibleWeapons.length === 0 && (
        <p className="text-xs text-hud-green/60">
          Complete missions to unlock weapons for purchase.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {visibleWeapons.map((weapon) => {
          const owned = countOwnedWeapon(ship, weapon.id);
          const dps = Math.round(
            weapon.damage * weapon.projectileCount * (1000 / weapon.fireRateMs)
          );
          return (
            <li
              key={weapon.id}
              className="rounded border border-space-border px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex items-center gap-2 min-w-0">
                  <WeaponDot tint={weapon.tint} />
                  <span className="font-display text-sm tracking-wider truncate">
                    {weapon.name}
                  </span>
                  <TierBadge tier={weapon.tier} />
                  {owned > 0 && (
                    <span
                      className="shrink-0 rounded border border-hud-green/40 bg-hud-green/5 px-1.5 py-0.5 font-mono text-[10px] text-hud-green/80"
                      title={`You already own ${owned} cop${owned === 1 ? "y" : "ies"} of this weapon (sum across loadout slots and inventory).`}
                    >
                      ×{owned}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="font-mono text-[11px] text-hud-green/70">
                  <span
                    className="text-hud-amber"
                    title="Damage per second — projectiles × damage × fire rate. Doesn't include any augments yet (you haven't bought it)."
                  >
                    DPS {dps}
                  </span>
                  <span className="mx-1.5 text-hud-green/30">·</span>
                  <span title="Energy cost per shot. Drains the reactor; recharges over time.">
                    ⚡ {weapon.energyCost}
                  </span>
                  {weapon.projectileCount > 1 && (
                    <>
                      <span className="mx-1.5 text-hud-green/30">·</span>
                      <span title={`${weapon.damage} damage per projectile × ${weapon.projectileCount} projectiles per shot.`}>
                        {weapon.damage}×{weapon.projectileCount}
                      </span>
                    </>
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onShowWeaponDetails(weapon)}
                    className="touch-manipulation select-none rounded border border-hud-green/40 px-2 py-0.5 font-mono text-[11px] text-hud-green/80 hover:bg-hud-green/10 active:bg-hud-green/20"
                  >
                    DETAILS
                  </button>
                  <button
                    type="button"
                    disabled={credits < weapon.cost}
                    onClick={() => onBuyWeapon(weapon)}
                    className="touch-manipulation select-none rounded border border-hud-amber/60 px-2 py-0.5 font-mono text-[11px] text-hud-amber enabled:hover:bg-hud-amber/10 enabled:active:bg-hud-amber/20 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
                  >
                    BUY · ¢{weapon.cost}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </CatalogSection>
  );
}
