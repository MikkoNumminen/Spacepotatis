import { useState } from "react";
import { equipWeapon, installAugment } from "@/game/state/GameState";
import type { WeaponPosition } from "@/game/state/ShipConfig";
import type { AugmentId } from "@/types/game";

// `picker` is the slot index whose SlotPicker is open (null = closed).
// `augPickerPos` addresses the specific WeaponInstance whose AugmentPicker
// is open (null = closed). Each instance lives at exactly one position so
// the picker needs the position, not just the weapon id.
export function useLoadoutSelection() {
  const [picker, setPicker] = useState<number | null>(null);
  const [augPickerPos, setAugPickerPos] = useState<WeaponPosition | null>(null);

  const openPicker = (slotIndex: number) => setPicker(slotIndex);
  const closePicker = () => setPicker(null);
  const selectForPicker = (inventoryIndex: number | null) => {
    if (picker === null) return;
    equipWeapon(picker, inventoryIndex);
    closePicker();
  };

  const openAugPicker = (position: WeaponPosition) => setAugPickerPos(position);
  const closeAugPicker = () => setAugPickerPos(null);
  const installForAugPicker = (augmentId: AugmentId) => {
    if (augPickerPos === null) return;
    installAugment(augPickerPos, augmentId);
    closeAugPicker();
  };

  return {
    picker,
    augPickerPos,
    openPicker,
    closePicker,
    selectForPicker,
    openAugPicker,
    closeAugPicker,
    installForAugPicker
  };
}
