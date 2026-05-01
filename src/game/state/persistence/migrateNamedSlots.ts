import { assignSlotsFromPool } from "./legacyShared";
import type { LegacyNamedSlots, LegacyShipSnapshot, SlotsAndInventory } from "./types";

// Named-slots legacy shape: slots is the four-named-slot object
// `{ front, rear, sidekickLeft, sidekickRight }`. Only `front` survives as
// a slot reference; otherwise treat as legacy id-array.
export function migrateNamedSlots(raw: LegacyShipSnapshot): SlotsAndInventory {
  const named = raw.slots as LegacyNamedSlots;
  const slotIds: (string | null)[] = [
    typeof named.front === "string" ? named.front : null
  ];
  return assignSlotsFromPool(slotIds, raw);
}
