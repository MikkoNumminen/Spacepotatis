import type { ReactNode } from "react";

// Shared loadout-panel section divider — top border + uppercase label +
// wider letter-spacing. Used by EQUIPPED, INVENTORY, AUGMENT INVENTORY,
// and the inventory-empty placeholder. Single style source so a future
// tweak lands in one place rather than three identical inline h3s.
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-6 mb-3 border-t border-hud-green/30 pt-3 font-display text-sm uppercase tracking-[0.2em] text-hud-green">
      {children}
    </h3>
  );
}
