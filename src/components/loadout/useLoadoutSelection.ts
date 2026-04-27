import { useState } from "react";
import { equipWeapon, installAugment } from "@/game/state/GameState";
import type { AugmentId, WeaponDefinition, WeaponId } from "@/types/game";

// Slot index — `null` means no picker is open. Was previously a SlotName
// string union; switched to numeric index when the slot record became an
// array indexed by position in ShipConfig.slots.
export function useLoadoutSelection() {
  const [picker, setPicker] = useState<number | null>(null);
  const [augPickerWeapon, setAugPickerWeapon] = useState<WeaponId | null>(null);

  const openPicker = (slotIndex: number) => setPicker(slotIndex);
  const closePicker = () => setPicker(null);
  const selectForPicker = (id: WeaponDefinition["id"] | null) => {
    if (picker === null) return;
    equipWeapon(picker, id);
    closePicker();
  };

  const openAugPicker = (weaponId: WeaponId) => setAugPickerWeapon(weaponId);
  const closeAugPicker = () => setAugPickerWeapon(null);
  const installForAugPicker = (augmentId: AugmentId) => {
    if (augPickerWeapon === null) return;
    installAugment(augPickerWeapon, augmentId);
    closeAugPicker();
  };

  return {
    picker,
    augPickerWeapon,
    openPicker,
    closePicker,
    selectForPicker,
    openAugPicker,
    closeAugPicker,
    installForAugPicker
  };
}
