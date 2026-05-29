import { useState } from "react";
import { MAX_AUGMENTS_PER_WEAPON, getAugment, getStat } from "@/game/data";
import type { AugmentDefinition } from "@/game/data";
import type { WeaponDefinition } from "@/types";
import type { WeaponInstance } from "@/game/state";
import { AugmentDot } from "./dots";
import { AugmentDetailsModal } from "./AugmentDetailsModal";

// The augment chip row + its detail modal — the per-weapon augment surface
// in WeaponCard. Owns the modal state so the parent card stays focused on
// the weapon row itself. Slot-count chip opens the augment-slots stat
// modal via the parent's onOpenSlots callback; per-augment chips open the
// AugmentDetailsModal owned here.
export function WeaponCardAugmentSection({
  weapon,
  instance,
  onOpenSlots
}: {
  weapon: WeaponDefinition;
  instance: WeaponInstance;
  onOpenSlots: (detail: string) => void;
}) {
  const [augmentDetail, setAugmentDetail] = useState<AugmentDefinition | null>(null);
  const installed = instance.augments;
  const slotsLeft = MAX_AUGMENTS_PER_WEAPON - installed.length;
  const slotsDetail =
    `${installed.length}/${MAX_AUGMENTS_PER_WEAPON} used · ` +
    `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} free`;
  const slotsStat = getStat("augment-slots");
  // Every chip renders as a button so the player can click anywhere on
  // the chip — slot-count or per-augment — to hear the matching Grandma
  // line. Per-augment chips reuse AugmentDetailsModal (already wired
  // with `/audio/augments/<id>-voice.mp3`).
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onOpenSlots(slotsDetail)}
          title={`${slotsStat.name} — click for details`}
          className="touch-manipulation select-none shrink-0 rounded border border-hud-green/40 px-1.5 py-0.5 font-mono text-[11px] text-hud-green/80 hover:bg-hud-green/10 active:bg-hud-green/20"
        >
          <span aria-hidden className="mr-1">{slotsStat.icon}</span>
          {installed.length}/{MAX_AUGMENTS_PER_WEAPON}
        </button>
        {installed.map((id, idx) => {
          const aug = getAugment(id);
          return (
            <button
              key={`${id}-${idx}`}
              type="button"
              onClick={() => setAugmentDetail(aug)}
              title={`${aug.name} — click for details`}
              className="touch-manipulation select-none flex items-center gap-1 rounded border border-hud-amber/40 px-1.5 py-0.5 font-mono text-[10px] text-hud-amber/80 hover:bg-hud-amber/10 active:bg-hud-amber/20"
            >
              <AugmentDot tint={aug.tint} />
              <span>{aug.name}</span>
            </button>
          );
        })}
      </div>
      {augmentDetail && (
        <AugmentDetailsModal
          augment={augmentDetail}
          context={{ weapon, instance }}
          onClose={() => setAugmentDetail(null)}
        />
      )}
    </>
  );
}
