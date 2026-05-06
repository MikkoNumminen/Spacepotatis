import { describe, it, expect } from "vitest";
import type { Profile } from "next-auth";
import { isEmailVerifiedAcceptable } from "@/lib/authEmailVerified";

// Regression guard for SEC-019. The fix wires `isEmailVerifiedAcceptable`
// into NextAuth's `signIn` callback — when an OAuth provider explicitly
// reports `profile.email_verified === false`, sign-in is rejected (returning
// `false` from the `signIn` callback redirects to the error page instead of
// issuing a JWT). Today this is a no-op against Google's consumer accounts
// (always `email_verified: true`); the guard exists for defense-in-depth
// against Workspace trial accounts, future provider swaps, or any change to
// the Google OAuth Console allow-list. See docs/security/02b-attack-cells.md
// (SEC-019) for the full rationale.

describe("SEC-019 — sign-in is rejected when OAuth profile.email_verified === false", () => {
  it("rejects when profile.email_verified is explicitly false", () => {
    const profile: Profile = {
      email: "trial-account@example.com",
      email_verified: false
    };
    expect(isEmailVerifiedAcceptable(profile)).toBe(false);
  });

  it("accepts when profile.email_verified is explicitly true", () => {
    const profile: Profile = {
      email: "verified@example.com",
      email_verified: true
    };
    expect(isEmailVerifiedAcceptable(profile)).toBe(true);
  });

  it("accepts when profile.email_verified is omitted (Google consumer contract)", () => {
    const profile: Profile = { email: "consumer@example.com" };
    expect(isEmailVerifiedAcceptable(profile)).toBe(true);
  });

  it("accepts when profile.email_verified is null (no claim emitted)", () => {
    const profile: Profile = {
      email: "null-claim@example.com",
      email_verified: null
    };
    expect(isEmailVerifiedAcceptable(profile)).toBe(true);
  });

  it("accepts when the profile itself is undefined", () => {
    expect(isEmailVerifiedAcceptable(undefined)).toBe(true);
  });

  it("rejects strict false even when an email is present", () => {
    // Belt-and-braces: the dangerous combo is "email looks fine, verified
    // claim explicitly false". The check must reject on the verified flag,
    // not be tricked by the email string passing other checks.
    const profile: Profile = {
      email: "looks-legit@gmail.com",
      email_verified: false,
      name: "Looks Legit"
    };
    expect(isEmailVerifiedAcceptable(profile)).toBe(false);
  });
});
