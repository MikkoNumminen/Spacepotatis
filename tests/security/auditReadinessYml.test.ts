// SEC-023 regression guard: audit-readiness-check.yml must pass the issue body
// via --body-file, not via shell interpolation. Shell interpolation of
// user-controlled content (even indirectly from DB output) enables command
// injection if a value contains shell metacharacters.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");
const WORKFLOW = ".github/workflows/audit-readiness-check.yml";

describe("SEC-023 — audit-readiness-check.yml passes issue body via --body-file", () => {
  const yaml = readFileSync(resolve(REPO_ROOT, WORKFLOW), "utf-8");

  it("uses --body-file to pass the issue body", () => {
    expect(yaml).toContain("--body-file");
  });

  it("does not shell-interpolate the body via ${body//...}", () => {
    expect(yaml).not.toContain("${body//");
  });

  it("does not use --body with a variable argument for gh issue create", () => {
    // Ensure gh issue create does not pass --body followed by a shell variable
    expect(yaml).not.toMatch(/gh issue create[^\n]*--body "\$/);
  });
});
