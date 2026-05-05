import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard for SEC-012. The fix is doc-only: a SECURITY-CRITICAL
// comment block in src/lib/auth.ts that documents the runtime dependency on
// AUTH_URL being pinned in the Vercel env vars + the Google OAuth Console
// redirect-URI allow-list. If a future cleanup deletes the comment, this
// test fails so the dependency is rediscovered before the next deploy.
// See docs/security/02b-attack-cells.md (SEC-012) for the full rationale.

const here = dirname(fileURLToPath(import.meta.url));

describe("SEC-012 — auth.ts documents the AUTH_URL pin requirement", () => {
  it("contains a SECURITY-CRITICAL comment about AUTH_URL + trustHost", () => {
    const source = readFileSync(resolve(here, "auth.ts"), "utf-8");
    expect(source).toMatch(/SECURITY-CRITICAL.*AUTH_URL/is);
    expect(source).toMatch(/trustHost/);
    expect(source).toMatch(/x-forwarded-host|Host header/i);
  });
});
