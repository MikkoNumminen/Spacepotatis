import type { AugmentId, WeaponId } from "@/types/game";
import { WEAPON_IDS } from "../../data/weapons";
import {
  MAX_LEVEL,
  type WeaponInstance
} from "../ShipConfig";
import { AUGMENT_IDS, MAX_AUGMENTS_PER_WEAPON } from "../../data/augments";

export interface LegacyWeaponInstanceLike {
  id?: WeaponId | string;
  level?: number;
  augments?: readonly (AugmentId | string)[];
}

export const KNOWN_AUGMENT_IDS = new Set<AugmentId>(AUGMENT_IDS);
const KNOWN_WEAPON_IDS = new Set<WeaponId>(WEAPON_IDS);

export function isKnownAugment(id: unknown): id is AugmentId {
  return typeof id === "string" && KNOWN_AUGMENT_IDS.has(id as AugmentId);
}

export function isKnownWeapon(id: unknown): id is WeaponId {
  return typeof id === "string" && KNOWN_WEAPON_IDS.has(id as WeaponId);
}

export function clampLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_LEVEL, Math.trunc(value)));
}

export function clampUpgradeLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_LEVEL, Math.trunc(value)));
}

export function sanitizeAugmentList(input: unknown): AugmentId[] {
  if (!Array.isArray(input)) return [];
  const out: AugmentId[] = [];
  for (const aid of input) {
    if (!isKnownAugment(aid)) continue;
    if (out.includes(aid)) continue;
    out.push(aid);
    if (out.length >= MAX_AUGMENTS_PER_WEAPON) break;
  }
  return out;
}

// A value looks like a WeaponInstance if it's a non-null object (and not an
// array) with at least an `id` field — even if level/augments are missing.
export function looksLikeInstance(value: unknown): value is LegacyWeaponInstanceLike {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "id" in (value as Record<string, unknown>)
  );
}

export function buildInstance(raw: LegacyWeaponInstanceLike): WeaponInstance | null {
  if (!isKnownWeapon(raw.id)) return null;
  return {
    id: raw.id,
    level: clampLevel(raw.level),
    augments: sanitizeAugmentList(raw.augments)
  };
}
