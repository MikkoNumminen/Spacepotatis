// Per-slot bullet spawn + pod x-offset relative to the ship center.
// Slot 0 fires from the nose; expansion slots alternate left/right and
// sit FAR ENOUGH out that the matching side-pod sprite lands clearly
// next to the main ship instead of behind it. The main ship sprite is
// ~50px wide; a pod is ~30px wide; so slot 1 needs |X| ≥ ~36 to
// clear the ship's silhouette. Slot pairs (1+2, 3+4, 5+6) are spaced
// by 36px increments so a max-loadout pilot reads as a tight V of
// pods rather than a single blob.
//
// Shared by PlayerFireController (bullet spawn) and PodController (pod
// sprite position) so bullets always emerge from where the pod is
// drawn — visually the pod fires its own gun.
const SLOT_X_OFFSETS = [0, -36, 36, -72, 72, -108, 108] as const;

export function slotXOffset(index: number): number {
  return SLOT_X_OFFSETS[index] ?? 0;
}
