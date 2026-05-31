#!/usr/bin/env node
// apply-defects.mjs — seed known content-audit defects into a worktree for
// recall-mode skill calibration (see ../RECALL-MODE.md).
//
// DESTRUCTIVE: this MUTATES files in --worktree. Only ever point it at a
// throwaway calibration worktree (e.g. .claude/worktrees/calib-recall-*), NEVER
// at a real checkout. It refuses to run unless --worktree is given explicitly.
//
// Each defect is a list of anchored find/replace ops with a drift guard: every
// op must match its expected occurrence count BEFORE any file is written. If a
// source file drifted and an anchor no longer matches exactly, the run aborts
// with the offending op and writes nothing — that loud failure is the signal to
// refresh the fixture, which is how fixtures stay tied to the content they probe.
//
// Usage:
//   node apply-defects.mjs --defects <defects.json> --worktree <dir> [--only id,id] [--dry-run] [--list]
//   --list     print the defect catalogue and exit (no worktree needed)
//   --dry-run  validate every anchor against the worktree; write nothing
//   --only     apply just these defect ids (comma-separated)

import { readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

function parseArgs(argv) {
  const args = { only: null, dryRun: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--defects") args.defects = argv[++i];
    else if (a === "--worktree") args.worktree = argv[++i];
    else if (a === "--only") args.only = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--list") args.list = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  return args;
}

function countOccurrences(haystack, needle) {
  if (needle === "") return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

// Returns { ok, count, applied } where `applied` is the new content (only when ok).
function applyOp(content, op) {
  const after = op.after ?? "";
  const expected = op.count ?? 1;
  let head = "";
  let region = content;
  if (after) {
    const at = content.indexOf(after);
    if (at === -1) return { ok: false, count: 0, reason: `after-anchor not found: ${JSON.stringify(after)}` };
    head = content.slice(0, at);
    region = content.slice(at);
  }
  const count = countOccurrences(region, op.find);
  if (count !== expected) {
    return { ok: false, count, reason: `expected ${expected} match(es) of ${JSON.stringify(op.find)}, found ${count}` };
  }
  const rel = region.indexOf(op.find);
  const applied = head + region.slice(0, rel) + op.replace + region.slice(rel + op.find.length);
  return { ok: true, count, applied };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.defects) throw new Error("--defects <defects.json> is required");
  const fixture = JSON.parse(readFileSync(args.defects, "utf8"));
  const defects = fixture.defects ?? [];

  if (args.list) {
    console.log(`Fixture: ${fixture.skill} (${defects.length} defects)`);
    for (const d of defects) {
      const stub = !Array.isArray(d.apply) || d.apply.length === 0;
      console.log(
        `  ${stub ? "STUB" : "    "} ${d.id.padEnd(28)} [${(d.difficulty ?? "?").padEnd(6)}] check#${d.probesCheck ?? "?"}  ${d.title ?? ""}`
      );
    }
    return;
  }

  if (!args.worktree) throw new Error("--worktree <dir> is required (point at a THROWAWAY calibration worktree, never master)");

  const selected = defects.filter((d) => {
    if (!Array.isArray(d.apply) || d.apply.length === 0) return false; // skip stubs
    if (args.only) return args.only.includes(d.id);
    return true;
  });

  // Mutate in-memory only; write at the very end iff every op validated.
  const fileCache = new Map(); // absPath -> content
  const touched = new Set();
  const failures = [];
  const okOps = [];

  for (const d of selected) {
    for (const op of d.apply) {
      if (op.type && op.type !== "replace") {
        failures.push(`${d.id}: unsupported op.type ${op.type} (only "replace")`);
        continue;
      }
      const abs = join(args.worktree, op.file);
      if (!fileCache.has(abs)) {
        try {
          fileCache.set(abs, readFileSync(abs, "utf8"));
        } catch {
          failures.push(`${d.id}: cannot read ${op.file} under worktree`);
          continue;
        }
      }
      const res = applyOp(fileCache.get(abs), op);
      if (!res.ok) {
        failures.push(`${d.id} -> ${op.file}: ${res.reason}`);
        continue;
      }
      fileCache.set(abs, res.applied);
      touched.add(abs);
      okOps.push(`${d.id} -> ${op.file}`);
    }
  }

  if (failures.length > 0) {
    console.error(`DRIFT / FAILURE — wrote nothing (${failures.length} problem(s)):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error(`\nThe fixture's anchors no longer match the source. Refresh calibration/fixtures/${fixture.skill}/defects.json against current master.`);
    process.exit(1);
  }

  if (args.dryRun) {
    console.log(`DRY-RUN ok — ${okOps.length} op(s) across ${touched.size} file(s) would apply cleanly:`);
    for (const o of okOps) console.log(`  ✓ ${o}`);
    return;
  }

  for (const abs of touched) writeFileSync(abs, fileCache.get(abs));
  console.log(`Applied ${okOps.length} op(s) from ${selected.length} defect(s) into ${args.worktree}:`);
  for (const abs of touched) console.log(`  ~ ${basename(abs)}`);
}

main();
