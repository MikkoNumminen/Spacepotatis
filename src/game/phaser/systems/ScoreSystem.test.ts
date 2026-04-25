import { describe, expect, it } from "vitest";
import { ScoreSystem } from "./ScoreSystem";

describe("ScoreSystem", () => {
  it("starts empty with combo 1", () => {
    const s = new ScoreSystem();
    expect(s.score).toBe(0);
    expect(s.credits).toBe(0);
    expect(s.combo).toBe(1);
  });

  it("first kill applies a 1x combo", () => {
    const s = new ScoreSystem();
    s.addKill(100, 5, 1000);
    expect(s.score).toBe(100);
    expect(s.credits).toBe(5);
    expect(s.combo).toBe(1);
  });

  it("kills inside the combo window stack the multiplier", () => {
    const s = new ScoreSystem();
    s.addKill(100, 5, 1000);
    s.addKill(100, 5, 2000);
    s.addKill(100, 5, 3000);
    expect(s.combo).toBe(3);
    expect(s.score).toBe(100 + 200 + 300);
  });

  it("combo resets when the gap exceeds the 2500ms window", () => {
    const s = new ScoreSystem();
    s.addKill(100, 5, 1000);
    s.addKill(100, 5, 5000);
    expect(s.combo).toBe(1);
    expect(s.score).toBe(200);
  });

  it("caps the combo multiplier at 8", () => {
    const s = new ScoreSystem();
    for (let i = 0; i < 20; i++) {
      s.addKill(10, 0, 1000 + i * 100);
    }
    expect(s.combo).toBe(8);
  });

  it("tick decays combo back to 1 after the window elapses", () => {
    const s = new ScoreSystem();
    s.addKill(100, 5, 1000);
    s.addKill(100, 5, 2000);
    expect(s.combo).toBe(2);
    s.tick(10000);
    expect(s.combo).toBe(1);
  });

  it("addCredits and addScore mutate the running totals", () => {
    const s = new ScoreSystem();
    s.addCredits(7);
    s.addScore(42);
    expect(s.credits).toBe(7);
    expect(s.score).toBe(42);
  });

  it("rounds combo-scaled scores to whole numbers", () => {
    const s = new ScoreSystem();
    s.addKill(33, 0, 1000);
    s.addKill(33, 0, 1500);
    s.addKill(33, 0, 2000);
    expect(Number.isInteger(s.score)).toBe(true);
  });
});
