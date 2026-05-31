// Boundary test for the grade-recall.mjs pure helpers. Dev tooling lives under
// calibration/ which is outside vitest's include + ESLint's scope, so this runs
// standalone via Node's built-in test runner:
//
//   node --test calibration/grade-recall.test.mjs
//
// It exercises the matching/scoring contract the live calibration depends on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { jaccard, anchorsPresent, fileMatch, matchesDefect, scoreArm } from "./grade-recall.mjs";

test("jaccard: identical / disjoint / partial / empty", () => {
  assert.equal(jaccard(new Set(["a", "b"]), new Set(["a", "b"])), 1);
  assert.equal(jaccard(new Set(["a"]), new Set(["b"])), 0);
  assert.equal(jaccard(new Set(["a", "b", "c"]), new Set(["a", "b"])), 2 / 3);
  assert.equal(jaccard(new Set(), new Set()), 1); // empty vs empty = identical, by convention
});

test("anchorsPresent: string, array (all required), case-insensitive, miss", () => {
  assert.equal(anchorsPresent("aphid-spectre", "wave references enemy 'aphid-spectre'"), true);
  assert.equal(anchorsPresent("APHID-Spectre", "references aphid-spectre"), true);
  assert.equal(anchorsPresent(["ember-run", "burnt-spud"], "cycle ember-run -> burnt-spud"), true);
  assert.equal(anchorsPresent(["ember-run", "burnt-spud"], "only mentions ember-run"), false);
  assert.equal(anchorsPresent("combat-2", "nothing relevant here"), false);
});

test("fileMatch: basename match + backslash normalization", () => {
  assert.equal(fileMatch("src/game/data/waves.json", "src/game/data/waves.json"), true);
  assert.equal(fileMatch("D:\\tmp\\wt\\src\\game\\data\\waves.json", "src/game/data/waves.json"), true);
  assert.equal(fileMatch("src/game/data/enemies.json", "src/game/data/waves.json"), false);
});

test("matchesDefect: requires BOTH file and anchor", () => {
  const defect = { groundTruth: { file: "src/game/data/waves.json", anchor: "aphid-spectre" } };
  assert.equal(matchesDefect(defect, { file: "src/game/data/waves.json", claim: "enemy aphid-spectre missing" }), true);
  assert.equal(matchesDefect(defect, { file: "src/game/data/enemies.json", claim: "enemy aphid-spectre missing" }), false);
  assert.equal(matchesDefect(defect, { file: "src/game/data/waves.json", claim: "an unrelated problem" }), false);
});

test("scoreArm: full recall + precision hit from one unmatched finding", () => {
  const applicable = [
    { id: "d1", difficulty: "easy", groundTruth: { file: "a.json", anchor: "x1" } },
    { id: "d2", difficulty: "hard", groundTruth: { file: "b.ts", anchor: ["y1", "y2"] } },
  ];
  const findings = [
    { file: "a.json", claim: "found x1 here" },
    { file: "b.ts", claim: "cycle y1 -> y2 detected" },
    { file: "c.json", claim: "an extra finding matching no seeded defect" },
  ];
  const s = scoreArm(applicable, findings);
  assert.equal(s.recall, 1);
  assert.equal(s.caught.size, 2);
  assert.equal(s.matched, 2);
  assert.equal(Math.round(s.precision * 100), 67);
  assert.equal(s.unmatched.length, 1);
  assert.equal(s.buckets.easy.caught, 1);
  assert.equal(s.buckets.hard.caught, 1);
});

test("scoreArm: partial recall, a missed hard defect", () => {
  const applicable = [
    { id: "d1", difficulty: "easy", groundTruth: { file: "a.json", anchor: "x1" } },
    { id: "d2", difficulty: "hard", groundTruth: { file: "b.ts", anchor: "y1" } },
  ];
  const s = scoreArm(applicable, [{ file: "a.json", claim: "x1 only" }]);
  assert.equal(s.recall, 0.5);
  assert.equal(s.precision, 1);
  assert.equal(s.buckets.hard.caught, 0);
});
