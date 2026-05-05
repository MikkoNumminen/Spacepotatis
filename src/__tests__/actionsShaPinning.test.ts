// SEC-015 regression guard: all uses: actions/...@<ref> must be pinned to a
// 40-character commit SHA, not a mutable semver tag like @v4.
// A mutable tag allows a compromised maintainer account to silently inject
// malicious code into any subsequent workflow run (see tj-actions/changed-files
// incident 2025). This test gates on CI so drift is caught before merge.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");

const WORKFLOWS = [
  ".github/workflows/ci.yml",
  ".github/workflows/audit-readiness-check.yml",
];

describe("SEC-015 — GitHub Actions are pinned to commit SHAs, not mutable tags", () => {
  for (const wf of WORKFLOWS) {
    it(`${wf}: every uses: actions/... line is pinned to a 40-char SHA`, () => {
      const yaml = readFileSync(resolve(REPO_ROOT, wf), "utf-8");
      const matches = [...yaml.matchAll(/^\s*-?\s*uses:\s*actions\/([^@\s]+)@(\S+)/gm)];
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        const name = m[1] ?? "";
        const ref = m[2] ?? "";
        expect(
          /^[0-9a-f]{40}$/.test(ref),
          `actions/${name}@${ref} in ${wf} is not a 40-char commit SHA — pin it to a full SHA with a # vX.Y.Z comment`
        ).toBe(true);
      }
    });
  }
});
