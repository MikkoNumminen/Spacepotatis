// SEC-029 regression guard: all workflows must have an explicit permissions:
// block at workflow level. Without it the workflow inherits the repo default
// GITHUB_TOKEN permissions which may be read-write. Locking to contents: read
// follows least-privilege; audit-readiness-check.yml also needs issues: write
// for the gh issue create step.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");

const WORKFLOWS = [
  ".github/workflows/ci.yml",
  ".github/workflows/audit-readiness-check.yml",
];

describe("SEC-029 — workflows have explicit permissions: blocks", () => {
  for (const wf of WORKFLOWS) {
    it(`${wf}: has a top-level permissions: block`, () => {
      const yaml = readFileSync(resolve(REPO_ROOT, wf), "utf-8");
      expect(yaml).toMatch(/^permissions:/m);
    });

    it(`${wf}: does not grant write for contents`, () => {
      const yaml = readFileSync(resolve(REPO_ROOT, wf), "utf-8");
      // contents: write would be a violation
      expect(yaml).not.toMatch(/contents:\s*write/);
    });
  }
});
