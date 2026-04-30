import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// Pre-commit guard for the .claude/skills/ catalog: every `src/...` path a
// skill mentions must actually resolve in the working tree. The April 2026
// re-audit found `/balance-review` had been silently citing
// `src/game/phaser/data` (a path that never existed) for an unknown
// stretch — this test prevents that class of drift from ever landing
// without a CI failure.

const REPO_ROOT = resolve(__dirname, "..", "..");
const SKILLS_DIR = resolve(REPO_ROOT, ".claude", "skills");

function listSkills(): readonly { readonly name: string; readonly path: string }[] {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR)
    .map((name) => ({ name, path: resolve(SKILLS_DIR, name, "SKILL.md") }))
    .filter((s) => existsSync(s.path) && statSync(s.path).isFile());
}

// Capture group 1: a `src/...` path. Trailing line-number / anchor / range
// suffixes are stripped after capture so we test the file ref alone.
const PATH_PATTERN = /\b(src\/[A-Za-z0-9_./-]+)/g;

function extractRepoPaths(markdown: string): readonly string[] {
  const found = new Set<string>();
  for (const match of markdown.matchAll(PATH_PATTERN)) {
    let path = match[1];
    if (path === undefined) continue;
    // Strip line refs like `:34-52`, `:81`, `#L42`, `#useEffect`.
    path = path.replace(/[#:][^/]*$/, "");
    // Strip trailing markdown punctuation that the regex pulled in.
    path = path.replace(/[.,;)`*]+$/, "");
    // Skip placeholders — every <foo>, every literal "*", and any path
    // segment that's just punctuation. The `*` glob (used in
    // `src/components/loadout/*`) means "the directory" — strip it.
    if (/<[^>]*>/.test(path)) continue;
    if (path.endsWith("/*") || path.endsWith("/**")) {
      path = path.replace(/\/\*+$/, "");
    }
    if (path === "src") continue;
    found.add(path);
  }
  return [...found];
}

const skills = listSkills();

describe("skill catalog path references", () => {
  // If the directory is missing entirely (rare — running the test from a
  // checkout that lacks .claude/), surface that as one explicit failure
  // rather than zero tests silently passing.
  it("at least one skill is registered", () => {
    expect(skills.length).toBeGreaterThan(0);
  });

  for (const skill of skills) {
    it(`every src/... ref in ${skill.name}/SKILL.md resolves`, () => {
      const md = readFileSync(skill.path, "utf8");
      const refs = extractRepoPaths(md);
      const missing = refs.filter((ref) => !existsSync(resolve(REPO_ROOT, ref)));
      expect(
        missing,
        `${skill.name} references paths that do not exist:\n  ${missing.join("\n  ")}`
      ).toEqual([]);
    });
  }
});
