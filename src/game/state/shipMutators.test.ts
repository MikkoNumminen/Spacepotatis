import { beforeEach, describe, expect, it } from "vitest";
import {
  addCredits,
  buyArmorUpgrade,
  buyReactorCapacityUpgrade,
  buyReactorRechargeUpgrade,
  buyShieldUpgrade,
  getState,
  grantArmorUpgrade,
  grantReactorCapacityUpgrade,
  grantReactorRechargeUpgrade,
  grantShieldUpgrade,
  resetForTests
} from "./GameState";
import { MAX_LEVEL } from "./ShipConfig";

// Wave 2 collapsed eight buy/grant upgrade entry points into a single
// applyLevelUpgrade(field, costFn, charge) helper. GameState.test.ts already
// covers the buy* variants; the grant* variants (used by mission-clear
// rewards via rewards.ts → applyMissionReward) had ZERO direct tests after
// the refactor. These pin the contract:
//   - grant* never debits credits
//   - grant* increments the level on success
//   - grant* refuses past MAX_LEVEL (returns false) with no level bump
//   - the corresponding buy* rejects-when-broke path (covered in
//     GameState.test.ts) is paired with a brief grant* parity assertion
//     here to catch any future regression where the wrappers diverge.

beforeEach(() => {
  resetForTests();
});

describe("grant*Upgrade variants (free, mission-clear-reward path)", () => {
  describe("grantShieldUpgrade", () => {
    it("increments shieldLevel without spending credits", () => {
      expect(getState().credits).toBe(0);
      expect(grantShieldUpgrade()).toBe(true);
      expect(getState().ship.shieldLevel).toBe(1);
      expect(getState().credits).toBe(0);
    });

    it("returns false at MAX_LEVEL and leaves the level pinned", () => {
      for (let i = 0; i < MAX_LEVEL; i++) grantShieldUpgrade();
      expect(getState().ship.shieldLevel).toBe(MAX_LEVEL);
      expect(grantShieldUpgrade()).toBe(false);
      expect(getState().ship.shieldLevel).toBe(MAX_LEVEL);
    });
  });

  describe("grantArmorUpgrade", () => {
    it("increments armorLevel without spending credits", () => {
      expect(grantArmorUpgrade()).toBe(true);
      expect(getState().ship.armorLevel).toBe(1);
      expect(getState().credits).toBe(0);
    });

    it("returns false at MAX_LEVEL", () => {
      for (let i = 0; i < MAX_LEVEL; i++) grantArmorUpgrade();
      expect(grantArmorUpgrade()).toBe(false);
      expect(getState().ship.armorLevel).toBe(MAX_LEVEL);
    });
  });

  describe("grantReactorCapacityUpgrade", () => {
    it("increments reactor.capacityLevel without spending credits", () => {
      expect(grantReactorCapacityUpgrade()).toBe(true);
      expect(getState().ship.reactor.capacityLevel).toBe(1);
      expect(getState().ship.reactor.rechargeLevel).toBe(0);
      expect(getState().credits).toBe(0);
    });

    it("returns false at MAX_LEVEL with no spurious bump", () => {
      for (let i = 0; i < MAX_LEVEL; i++) grantReactorCapacityUpgrade();
      expect(grantReactorCapacityUpgrade()).toBe(false);
      expect(getState().ship.reactor.capacityLevel).toBe(MAX_LEVEL);
    });
  });

  describe("grantReactorRechargeUpgrade", () => {
    it("increments reactor.rechargeLevel without spending credits", () => {
      expect(grantReactorRechargeUpgrade()).toBe(true);
      expect(getState().ship.reactor.rechargeLevel).toBe(1);
      expect(getState().ship.reactor.capacityLevel).toBe(0);
      expect(getState().credits).toBe(0);
    });

    it("returns false at MAX_LEVEL with no spurious bump", () => {
      for (let i = 0; i < MAX_LEVEL; i++) grantReactorRechargeUpgrade();
      expect(grantReactorRechargeUpgrade()).toBe(false);
      expect(getState().ship.reactor.rechargeLevel).toBe(MAX_LEVEL);
    });
  });
});

describe("buy/grant parity (the shared applyLevelUpgrade engine)", () => {
  it("buy* and grant* both bump the same field, but only buy* charges", () => {
    // Two parallel runs: buy from a flush wallet, grant from an empty one.
    // Both should land at the same final level on the shield field.
    grantShieldUpgrade();
    grantShieldUpgrade();
    expect(getState().ship.shieldLevel).toBe(2);
    expect(getState().credits).toBe(0);

    resetForTests();
    // First buyShield costs 200 (200 * 2^0), second costs 400 (200 * 2^1).
    addCredits(600);
    expect(buyShieldUpgrade()).toBe(true);
    expect(buyShieldUpgrade()).toBe(true);
    expect(getState().ship.shieldLevel).toBe(2);
    expect(getState().credits).toBe(0);
  });

  it("buy* refuses without sufficient credits; grant* succeeds regardless", () => {
    expect(getState().credits).toBe(0);
    expect(buyArmorUpgrade()).toBe(false);
    expect(getState().ship.armorLevel).toBe(0);
    expect(grantArmorUpgrade()).toBe(true);
    expect(getState().ship.armorLevel).toBe(1);
  });

  it("grant* at MAX_LEVEL is symmetric with buy* at MAX_LEVEL — both refuse", () => {
    addCredits(1_000_000);
    for (let i = 0; i < MAX_LEVEL; i++) buyReactorCapacityUpgrade();
    expect(getState().ship.reactor.capacityLevel).toBe(MAX_LEVEL);

    const creditsAtCap = getState().credits;
    expect(buyReactorCapacityUpgrade()).toBe(false);
    // Credits MUST NOT be debited when the cap rejects the purchase — otherwise
    // a maxed reactor would silently drain the wallet on every shop click.
    expect(getState().credits).toBe(creditsAtCap);
    expect(grantReactorCapacityUpgrade()).toBe(false);
    expect(getState().ship.reactor.capacityLevel).toBe(MAX_LEVEL);
  });

  it("buyReactorRecharge insufficient-credit path — leaves both wallet and level untouched", () => {
    // 200 base recharge cost, wallet at 199 — one off.
    addCredits(199);
    expect(buyReactorRechargeUpgrade()).toBe(false);
    expect(getState().credits).toBe(199);
    expect(getState().ship.reactor.rechargeLevel).toBe(0);
  });
});
