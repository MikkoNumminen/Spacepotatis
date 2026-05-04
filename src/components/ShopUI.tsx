"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buyArmorUpgrade,
  buyAugment,
  buyReactorCapacityUpgrade,
  buyReactorRechargeUpgrade,
  buyShieldUpgrade,
  buyWeapon,
  markStorySeen
} from "@/game/state/GameState";
import { saveNow } from "@/game/state/sync";
import { STORY_ENTRIES } from "@/game/data/story";
import { itemSfx } from "@/game/audio/itemSfx";
import { menuMusic, shopMusic } from "@/game/audio/music";
import { storyAudio } from "@/game/audio/story";
import {
  MAX_LEVEL,
  armorUpgradeCost,
  getMaxArmor,
  getMaxShield,
  getReactorCapacity,
  getReactorRecharge,
  reactorCapacityCost,
  reactorRechargeCost,
  shieldUpgradeCost
} from "@/game/state/ShipConfig";
import { getWeapon } from "@/game/data/weapons";
import { getAllAugments } from "@/game/data/augments";
import { getBuyableWeaponIds } from "@/game/data/missionWeaponRewards";
import type { AugmentId, WeaponDefinition, WeaponId } from "@/types/game";
import type { AugmentDefinition } from "@/game/data/augments";
import type { ShipConfig } from "@/game/state/ShipConfig";
import { useGameState } from "@/game/state/useGameState";
import { WeaponDetailsModal } from "@/components/loadout/WeaponDetailsModal";
import { AugmentDetailsModal } from "@/components/loadout/AugmentDetailsModal";
import { AugmentDot, WeaponDot } from "@/components/loadout/dots";

// Total copies of a weapon id the player owns across slots + inventory.
// Used to decorate buy rows so the player can see "owned · N" before purchase.
function countOwnedWeapon(ship: ShipConfig, id: WeaponId): number {
  let n = 0;
  for (const slot of ship.slots) if (slot?.id === id) n++;
  for (const inst of ship.inventory) if (inst.id === id) n++;
  return n;
}

// Total copies of an augment id, INCLUDING ones already installed on weapons
// (those can't be uninstalled, but the player still "has" the augment id).
// Free-to-install copies live in augmentInventory.
function countOwnedAugment(ship: ShipConfig, id: AugmentId): {
  total: number;
  free: number;
} {
  const free = ship.augmentInventory.filter((a) => a === id).length;
  let installed = 0;
  for (const slot of ship.slots) if (slot) installed += slot.augments.filter((a) => a === id).length;
  for (const inst of ship.inventory) installed += inst.augments.filter((a) => a === id).length;
  return { total: free + installed, free };
}

export default function ShopUI() {
  const credits = useGameState((s) => s.credits);
  const ship = useGameState((s) => s.ship);
  const seenStoryEntries = useGameState((s) => s.seenStoryEntries);
  const completedMissions = useGameState((s) => s.completedMissions);
  const [weaponDetails, setWeaponDetails] = useState<WeaponDefinition | null>(null);
  const [augmentDetails, setAugmentDetails] = useState<AugmentDefinition | null>(null);

  // Per-mission unlock gate: each mission-kind mission unlocks one weapon
  // for purchase. See src/game/data/missionWeaponRewards.ts for the map.
  // LoadoutMenu remains ungated — owned weapons stay usable everywhere.
  const visibleWeapons = getBuyableWeaponIds(new Set(completedMissions)).map(
    (id) => getWeapon(id)
  );

  // Plays the on-shop-open briefing every time the player docks (any shop
  // → /shop). The seen-set is consulted only to decide whether to mark
  // seen + save (first dock) — the audio plays unconditionally so a
  // returning player still gets the welcome line on every visit.
  // Empty dep array intentionally: fire once on mount, cleanup stops
  // the voice if the player navigates away mid-playback.
  useEffect(() => {
    const entry = STORY_ENTRIES.find((e) => e.autoTrigger?.kind === "on-shop-open");
    if (!entry) return;
    storyAudio.play({
      musicSrc: entry.musicTrack,
      voiceSrc: entry.voiceTrack,
      voiceDelayMs: entry.voiceDelayMs
    });
    if (!seenStoryEntries.includes(entry.id)) {
      markStorySeen(entry.id);
      void saveNow();
    }
    return () => {
      storyAudio.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shop bed: ducks the menu/galaxy bed and plays /audio/music/shop.ogg
  // for the duration of the visit. Per-shop music is a future change —
  // when it lands, swap the hard-coded path for a per-mission lookup.
  useEffect(() => {
    menuMusic.duck();
    shopMusic.loadTrack("/audio/music/shop.ogg");
    return () => {
      shopMusic.stop();
      menuMusic.unduck();
    };
  }, []);

  const shieldCost = shieldUpgradeCost(ship.shieldLevel);
  const armorCost = armorUpgradeCost(ship.armorLevel);
  const reactorCapCost = reactorCapacityCost(ship.reactor.capacityLevel);
  const reactorRechCost = reactorRechargeCost(ship.reactor.rechargeLevel);
  const shieldMaxed = ship.shieldLevel >= MAX_LEVEL;
  const armorMaxed = ship.armorLevel >= MAX_LEVEL;
  const reactorCapMaxed = ship.reactor.capacityLevel >= MAX_LEVEL;
  const reactorRechMaxed = ship.reactor.rechargeLevel >= MAX_LEVEL;

  // Each handler fires its sfx alongside the mutation. The buttons are
  // disabled when the player can't afford the cost, so reaching the
  // handler implies a successful purchase.
  const handleBuyShield = useCallback(() => {
    buyShieldUpgrade();
    itemSfx.upgrade();
  }, []);
  const handleBuyArmor = useCallback(() => {
    buyArmorUpgrade();
    itemSfx.upgrade();
  }, []);
  const handleBuyReactorCap = useCallback(() => {
    buyReactorCapacityUpgrade();
    itemSfx.upgrade();
  }, []);
  const handleBuyReactorRech = useCallback(() => {
    buyReactorRechargeUpgrade();
    itemSfx.upgrade();
  }, []);

  return (
    <>
      <div className="grid gap-4 sm:gap-6 md:grid-cols-[1fr_1fr]">
        <section className="rounded border border-space-border bg-space-panel/70 p-4 sm:p-5">
          <header className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display tracking-widest text-hud-green">HULL & SHIELD</h2>
            <span className="font-mono text-xs text-hud-amber">¢ {credits}</span>
          </header>

          <Row
            label="Shield capacity"
            detail={`level ${ship.shieldLevel}/${MAX_LEVEL} · max ${getMaxShield(ship)}`}
            cost={shieldMaxed ? null : shieldCost}
            disabled={shieldMaxed || credits < shieldCost}
            onClick={handleBuyShield}
            cta={shieldMaxed ? "maxed" : "UPGRADE"}
          />
          <Row
            label="Armor plating"
            detail={`level ${ship.armorLevel}/${MAX_LEVEL} · max HP ${getMaxArmor(ship)}`}
            cost={armorMaxed ? null : armorCost}
            disabled={armorMaxed || credits < armorCost}
            onClick={handleBuyArmor}
            cta={armorMaxed ? "maxed" : "UPGRADE"}
          />

          <h3 className="mt-5 mb-2 font-display text-xs tracking-widest text-hud-amber">REACTOR</h3>
          <Row
            label="Reactor capacity"
            detail={`level ${ship.reactor.capacityLevel}/${MAX_LEVEL} · max ⚡ ${getReactorCapacity(ship)}`}
            cost={reactorCapMaxed ? null : reactorCapCost}
            disabled={reactorCapMaxed || credits < reactorCapCost}
            onClick={handleBuyReactorCap}
            cta={reactorCapMaxed ? "maxed" : "UPGRADE"}
          />
          <Row
            label="Reactor recharge"
            detail={`level ${ship.reactor.rechargeLevel}/${MAX_LEVEL} · ⚡/s ${getReactorRecharge(ship)}`}
            cost={reactorRechMaxed ? null : reactorRechCost}
            disabled={reactorRechMaxed || credits < reactorRechCost}
            onClick={handleBuyReactorRech}
            cta={reactorRechMaxed ? "maxed" : "UPGRADE"}
          />
        </section>

        <section className="rounded border border-space-border bg-space-panel/70 p-4 sm:p-5">
          <header className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display tracking-widest text-hud-green">NEW WEAPONS</h2>
            <span className="font-mono text-xs text-hud-amber">¢ {credits}</span>
          </header>

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
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded border border-space-border px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <WeaponDot tint={weapon.tint} />
                    <span className="font-display text-sm tracking-wider truncate">
                      {weapon.name}
                    </span>
                    <TierBadge tier={weapon.tier} />
                    {owned > 0 && (
                      <span className="shrink-0 rounded border border-hud-green/40 bg-hud-green/5 px-1.5 py-0.5 font-mono text-[10px] text-hud-green/80">
                        ×{owned}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-[11px] text-hud-green/70">
                      <span className="text-hud-amber">DPS {dps}</span>
                      <span className="mx-1.5 text-hud-green/30">·</span>
                      <span>⚡ {weapon.energyCost}</span>
                      {weapon.projectileCount > 1 && (
                        <>
                          <span className="mx-1.5 text-hud-green/30">·</span>
                          <span>{weapon.damage}×{weapon.projectileCount}</span>
                        </>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setWeaponDetails(weapon)}
                        className="touch-manipulation select-none rounded border border-hud-green/40 px-2 py-0.5 font-mono text-[11px] text-hud-green/80 hover:bg-hud-green/10 active:bg-hud-green/20"
                      >
                        DETAILS
                      </button>
                      <button
                        type="button"
                        disabled={credits < weapon.cost}
                        onClick={() => {
                          buyWeapon(weapon.id);
                          itemSfx.weapon();
                        }}
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
        </section>

        <section className="rounded border border-space-border bg-space-panel/70 p-4 md:col-span-2 sm:p-5">
          <header className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display tracking-widest text-hud-green">AUGMENTS</h2>
            <span className="font-mono text-xs text-hud-amber">¢ {credits}</span>
          </header>

          <p className="mb-3 text-xs text-hud-green/60">
            Permanent weapon modifiers. One-way install. Open DETAILS for the full description.
          </p>

          <ul className="flex flex-col gap-1.5">
            {getAllAugments()
              .filter((a) => a.cost > 0)
              .map((aug) => {
                const { total, free } = countOwnedAugment(ship, aug.id);
                return (
                  <li
                    key={aug.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded border border-space-border px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AugmentDot tint={aug.tint} />
                      <span className="font-display text-sm tracking-wider truncate">
                        {aug.name}
                      </span>
                      {total > 0 && (
                        <span className="shrink-0 rounded border border-hud-green/40 bg-hud-green/5 px-1.5 py-0.5 font-mono text-[10px] text-hud-green/80">
                          ×{total}
                          {free !== total ? ` (free ${free})` : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAugmentDetails(aug)}
                        className="touch-manipulation select-none rounded border border-hud-green/40 px-2 py-0.5 font-mono text-[11px] text-hud-green/80 hover:bg-hud-green/10 active:bg-hud-green/20"
                      >
                        DETAILS
                      </button>
                      <button
                        type="button"
                        disabled={credits < aug.cost}
                        onClick={() => {
                          buyAugment(aug.id);
                          itemSfx.augment();
                        }}
                        className="touch-manipulation select-none rounded border border-hud-amber/60 px-2 py-0.5 font-mono text-[11px] text-hud-amber enabled:hover:bg-hud-amber/10 enabled:active:bg-hud-amber/20 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
                      >
                        BUY · ¢{aug.cost}
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      </div>

      {weaponDetails && (
        <WeaponDetailsModal
          weapon={weaponDetails}
          onClose={() => setWeaponDetails(null)}
        />
      )}
      {augmentDetails && (
        <AugmentDetailsModal
          augment={augmentDetails}
          onClose={() => setAugmentDetails(null)}
        />
      )}
    </>
  );
}

function TierBadge({ tier }: { tier: 1 | 2 }) {
  const cls =
    tier === 1
      ? "border-hud-green/40 text-hud-green/70"
      : "border-hud-amber/50 text-hud-amber/80";
  return (
    <span
      aria-label={`Tier ${tier}`}
      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${cls}`}
    >
      T{tier}
    </span>
  );
}

function Row({
  label,
  detail,
  cost,
  disabled,
  onClick,
  cta
}: {
  label: string;
  detail: string;
  cost: number | null;
  disabled: boolean;
  onClick: () => void;
  cta: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded border border-space-border p-3">
      <div className="min-w-0">
        <div className="font-display tracking-wider">{label}</div>
        <div className="text-xs text-hud-green/70">{detail}</div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {cost !== null && <span className="text-xs text-hud-amber">¢ {cost}</span>}
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className="touch-manipulation select-none rounded border border-hud-green/60 px-3 py-1 text-xs enabled:hover:bg-hud-green/10 enabled:active:bg-hud-green/20 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
        >
          {cta}
        </button>
      </div>
    </div>
  );
}
