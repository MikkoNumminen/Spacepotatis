import { useState } from "react";
import { equipWeapon, installAugment } from "@/game/state/GameState";
import type { SlotName } from "@/game/state/ShipConfig";
import type { AugmentId, WeaponDefinition, WeaponId } from "@/types/game";

export function useLoadoutSelection() {
  const [picker, setPicker] = useState<SlotName | null>(null);
  const [augPickerWeapon, setAugPickerWeapon] = useState<WeaponId | null>(null);

  const openPicker = (slot: SlotName) => setPicker(slot);
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
