import { describe, expect, it } from "vitest";

import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from "@/lib/handle";
import { HandlePayloadSchema } from "./handle";

describe("HandlePayloadSchema", () => {
  it("accepts a well-formed handle", () => {
    const result = HandlePayloadSchema.safeParse({ handle: "spud" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.handle).toBe("spud");
    }
  });

  it("accepts a handle with allowed special chars (underscore + hyphen)", () => {
    const result = HandlePayloadSchema.safeParse({ handle: "spud_king-99" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.handle).toBe("spud_king-99");
    }
  });

  it("trims surrounding whitespace before checking length / pattern", () => {
    const result = HandlePayloadSchema.safeParse({ handle: "  spud  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.handle).toBe("spud");
    }
  });

  it("rejects a handle that is too short after trimming", () => {
    const result = HandlePayloadSchema.safeParse({ handle: "ab" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(`${HANDLE_MIN_LENGTH}`);
    }
  });

  it("rejects whitespace-only that trims down below the minimum", () => {
    // " a " trims to "a" — single char < HANDLE_MIN_LENGTH (3).
    const result = HandlePayloadSchema.safeParse({ handle: " a " });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = HandlePayloadSchema.safeParse({ handle: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a handle that is too long", () => {
    const tooLong = "a".repeat(HANDLE_MAX_LENGTH + 1);
    const result = HandlePayloadSchema.safeParse({ handle: tooLong });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(`${HANDLE_MAX_LENGTH}`);
    }
  });

  it("accepts a handle exactly at the max length", () => {
    const atMax = "a".repeat(HANDLE_MAX_LENGTH);
    const result = HandlePayloadSchema.safeParse({ handle: atMax });
    expect(result.success).toBe(true);
  });

  it("accepts a handle exactly at the min length", () => {
    const atMin = "a".repeat(HANDLE_MIN_LENGTH);
    const result = HandlePayloadSchema.safeParse({ handle: atMin });
    expect(result.success).toBe(true);
  });

  it("rejects handles containing disallowed characters (space inside)", () => {
    const result = HandlePayloadSchema.safeParse({ handle: "spud king" });
    expect(result.success).toBe(false);
  });

  it("rejects handles containing disallowed punctuation", () => {
    expect(HandlePayloadSchema.safeParse({ handle: "spud!" }).success).toBe(false);
    expect(HandlePayloadSchema.safeParse({ handle: "spud.king" }).success).toBe(false);
    expect(HandlePayloadSchema.safeParse({ handle: "spud@king" }).success).toBe(false);
  });

  it("rejects handles containing unicode (ASCII-only by design)", () => {
    expect(HandlePayloadSchema.safeParse({ handle: "spüd" }).success).toBe(false);
    expect(HandlePayloadSchema.safeParse({ handle: "потато" }).success).toBe(false);
  });

  it("rejects when the handle field is missing", () => {
    const result = HandlePayloadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects when the handle field is null", () => {
    const result = HandlePayloadSchema.safeParse({ handle: null });
    expect(result.success).toBe(false);
  });

  it("rejects when the handle field is a number", () => {
    const result = HandlePayloadSchema.safeParse({ handle: 12345 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-object payload (top-level array)", () => {
    expect(HandlePayloadSchema.safeParse(["spud"]).success).toBe(false);
  });

  it("rejects a non-object payload (top-level string)", () => {
    expect(HandlePayloadSchema.safeParse("spud").success).toBe(false);
  });

  it("rejects null and undefined payloads", () => {
    expect(HandlePayloadSchema.safeParse(null).success).toBe(false);
    expect(HandlePayloadSchema.safeParse(undefined).success).toBe(false);
  });
});
