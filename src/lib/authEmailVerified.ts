import type { Profile } from "next-auth";

/**
 * SEC-019: defense-in-depth on the OAuth verified-email contract.
 *
 * Returns `false` only if the OAuth provider explicitly reports
 * `profile.email_verified === false`. Wired into NextAuth's `signIn`
 * callback in `src/lib/auth.ts` — returning `false` from `signIn` is the
 * canonical NextAuth v5 reject path (redirects to the error page instead
 * of issuing a JWT).
 *
 * Anything else (verified, missing, null, undefined, no profile) falls
 * through to allow — that matches Google's consumer-account contract
 * (always `true`) and avoids regressing providers that simply don't emit
 * the claim. Today Google upstream blocks unverified consumer emails, so
 * this is purely a defense-in-depth backstop for edge cases (e.g. Workspace
 * trial accounts) and any future provider/Console allow-list change.
 *
 * Lives in its own module (separate from `auth.ts`) so the regression test
 * can import the pure helper without dragging in the NextAuth runtime —
 * `next-auth` pulls `next/server` at module load, which breaks under
 * vitest's node environment.
 *
 * See docs/security/02b-attack-cells.md (SEC-019) for the full rationale.
 */
export function isEmailVerifiedAcceptable(profile: Profile | undefined): boolean {
  return profile?.email_verified !== false;
}
