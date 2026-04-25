import { describe, expect, it } from "vitest";
import { isShipConfig } from "./sync";

describe("isShipConfig", () => {
  it("accepts a well-formed ship snapshot", () => {
    expect(
      isShipConfig({
        primaryWeapon: "rapid-fire",
        unlockedWeapons: ["rapid-fire"],
        shieldLevel: 0,
        armorLevel: 0
      })
    ).toBe(true);
  });

  it("rejects null and primitives", () => {
    expect(isShipConfig(null)).toBe(false);
    expect(isShipConfig(undefined)).toBe(false);
    expect(isShipConfig("rapid-fire")).toBe(false);
    expect(isShipConfig(42)).toBe(false);
  });

  it("rejects objects missing required fields", () => {
    expect(isShipConfig({})).toBe(false);
    expect(isShipConfig({ primaryWeapon: "rapid-fire" })).toBe(false);
    expect(
      isShipConfig({
        primaryWeapon: "rapid-fire",
        unlockedWeapons: [],
        shieldLevel: "0",
        armorLevel: 0
      })
    ).toBe(false);
  });

  it("rejects objects where unlockedWeapons is not an array", () => {
    expect(
      isShipConfig({
        primaryWeapon: "rapid-fire",
        unlockedWeapons: "rapid-fire",
        shieldLevel: 0,
        armorLevel: 0
      })
    ).toBe(false);
  });
});
