import { describe, expect, it } from "vitest";
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH, validateHandle } from "./handle";

describe("validateHandle", () => {
  it("accepts a typical handle", () => {
    expect(validateHandle("potato_pilot")).toEqual({ ok: true, handle: "potato_pilot" });
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateHandle("  spud  ")).toEqual({ ok: true, handle: "spud" });
  });

  it("accepts hyphens, underscores, digits, mixed case", () => {
    expect(validateHandle("Spud-9_X")).toEqual({ ok: true, handle: "Spud-9_X" });
  });

  it("rejects non-strings", () => {
    expect(validateHandle(undefined).ok).toBe(false);
    expect(validateHandle(42).ok).toBe(false);
    expect(validateHandle(null).ok).toBe(false);
  });

  it("rejects too short", () => {
    const result = validateHandle("ab");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(String(HANDLE_MIN_LENGTH));
  });

  it("rejects too long", () => {
    const result = validateHandle("a".repeat(HANDLE_MAX_LENGTH + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(String(HANDLE_MAX_LENGTH));
  });

  it("rejects whitespace inside", () => {
    expect(validateHandle("space pilot").ok).toBe(false);
  });

  it("rejects punctuation outside [_-]", () => {
    expect(validateHandle("pilot!").ok).toBe(false);
    expect(validateHandle("pilot.name").ok).toBe(false);
    expect(validateHandle("pilot@home").ok).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateHandle("").ok).toBe(false);
  });
});
