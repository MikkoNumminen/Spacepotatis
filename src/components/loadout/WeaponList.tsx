import type { ShipConfig, WeaponPosition } from "@/game/state";
import { SectionHeading } from "./SectionHeading";
import { WeaponCard } from "./WeaponCard";
import type { WeaponEntry } from "./selectors";

export function WeaponList({
  ship,
  credits,
  entries,
  heading,
  showSellButton,
  showUpgradeButton,
  showInstallButton,
  onOpenInstaller
}: {
  ship: ShipConfig;
  credits: number;
  entries: readonly WeaponEntry[];
  heading?: string;
  showSellButton: boolean;
  showUpgradeButton: boolean;
  showInstallButton: boolean;
  onOpenInstaller: (position: WeaponPosition) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <>
      {heading && <SectionHeading>{heading}</SectionHeading>}
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <WeaponCard
            key={entry.key}
            weapon={entry.weapon}
            instance={entry.instance}
            position={entry.position}
            credits={credits}
            showSellButton={showSellButton && entry.position.kind === "inventory"}
            showUpgradeButton={showUpgradeButton}
            showInstallButton={showInstallButton}
            augmentInventory={ship.augmentInventory}
            onOpenInstaller={() => onOpenInstaller(entry.position)}
            slotBadge={"slotBadge" in entry ? entry.slotBadge : undefined}
          />
        ))}
      </ul>
    </>
  );
}
