// Per-slot bullet spawn x-offset relative to the ship center. Slot 0
// fires from the nose; expansion slots alternate left/right so a
// 3-slot loadout doesn't stack bullets on the same column. Indices
// past the array fall back to centerline. Shared by PlayerFireController
// (bullet spawn) and PodController (pod sprite position) so both stay
// in lockstep.
export const SLOT_X_OFFSETS = [0, -16, 16, -28, 28, -40, 40] as const;

export function slotXOffset(index: number): number {
  return SLOT_X_OFFSETS[index] ?? 0;
}
