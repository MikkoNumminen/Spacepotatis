#!/usr/bin/env node
// grade-recall.mjs — deterministic grader for recall-mode skill calibration
// (see ../RECALL-MODE.md). Read-only. NEVER lets a model grade its own recall.
//
// Given a defect fixture and one findings.json per arm, it computes the only
// numbers that mean anything for an AUDIT skill:
//   RECALL          — seeded defects caught / seeded defects applicable (bucketed by difficulty)
//   PRECISION        — matched findings / total findings (unmatched ones are flagged, not auto-counted as FPs)
//   REPRODUCIBILITY  — Jaccard of caught-defect sets across repeated runs of the same arm
//   TOKENS/DEFECT    — secondary efficiency axis; cost, never "save"
//
// A finding matches a defect iff its file path-matches the defect's file AND
// every anchor substring appears in the finding's `claim`. `kind` is recorded
// for context but NOT required to match — arms use inconsistent vocab; anchors
// (the bad id / bad path the finding must name) are the strong discriminator.
//
// Usage:
//   node grade-recall.mjs --defects <defects.json> \
//        --arm A=path/armA.json --arm B=path/armB.json \
//        [--repro B=run1.json,run2.json,run3.json] \
//        [--tokens A=71000 --tokens B=88000] [--out report.md]
//
// findings.json shape: { "findings": [ { "file": "...", "line": 42?, "kind": "..."?, "claim": "..." } ] }

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

function parseArgs(argv) {
  const args = { arms: [], repro: [], tokens: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--defects") args.defects = argv[++i];
    else if (a === "--arm") {
      const [label, file] = splitOnce(argv[++i], "=");
      args.arms.push({ label, file });
    } else if (a === "--repro") {
      const [label, files] = splitOnce(argv[++i], "=");
      args.repro.push({ label, files: files.split(",").map((s) => s.trim()) });
    } else if (a === "--tokens") {
      const [label, n] = splitOnce(argv[++i], "=");
      args.tokens[label] = Number(n);
    } else if (a === "--out") args.out = argv[++i];
    else throw new Error(`unknown arg: ${a}`);
  }
  return args;
}

function splitOnce(s, sep) {
  const i = s.indexOf(sep);
  return [s.slice(0, i), s.slice(i + 1)];
}

const norm = (s) => String(s ?? "").toLowerCase().replaceAll("\\", "/");

function fileMatch(findingFile, defectFile) {
  return norm(findingFile).includes(basename(defectFile).toLowerCase());
}

function anchorsPresent(anchor, claim) {
  const c = norm(claim);
  const anchors = Array.isArray(anchor) ? anchor : [anchor];
  return anchors.every((a) => c.includes(norm(a)));
}

function matchesDefect(defect, finding) {
  const gt = defect.groundTruth;
  return fileMatch(finding.file, gt.file) && anchorsPresent(gt.anchor, finding.claim);
}

function loadFindings(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  return parsed.findings ?? [];
}

function scoreArm(applicable, findings) {
  const caught = new Set();
  for (const d of applicable) {
    if (findings.some((f) => matchesDefect(d, f))) caught.add(d.id);
  }
  const matchedFindings = findings.filter((f) => applicable.some((d) => matchesDefect(d, f)));
  const unmatched = findings.filter((f) => !applicable.some((d) => matchesDefect(d, f)));

  const buckets = {};
  for (const d of applicable) {
    const b = (buckets[d.difficulty] ??= { total: 0, caught: 0 });
    b.total++;
    if (caught.has(d.id)) b.caught++;
  }

  return {
    caught,
    recall: applicable.length ? caught.size / applicable.length : 0,
    precision: findings.length ? matchedFindings.length / findings.length : 1,
    matched: matchedFindings.length,
    findings: findings.length,
    unmatched,
    buckets,
  };
}

function jaccard(a, b) {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 1;
}

function pct(x) {
  return `${(x * 100).toFixed(0)}%`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.defects) throw new Error("--defects is required");
  const fixture = JSON.parse(readFileSync(args.defects, "utf8"));
  const skill = fixture.skill;
  const applicable = (fixture.defects ?? []).filter(
    (d) => Array.isArray(d.apply) && d.apply.length > 0 && (!d.detectableBy || d.detectableBy.includes(skill))
  );

  const lines = [];
  const p = (s = "") => lines.push(s);

  p(`# Recall-mode calibration — ${skill}`);
  p("");
  p(`Applicable seeded defects: **${applicable.length}** (stubs excluded). Token cost is a *secondary* axis — it never decides keep-vs-cut for an audit skill.`);
  p("");
  p(`| Arm | Recall | easy | med | hard | Precision | Findings (matched/total) | Tokens/defect |`);
  p(`|---|---|---|---|---|---|---|---|`);

  const armScores = {};
  for (const { label, file } of args.arms) {
    const s = scoreArm(applicable, loadFindings(file));
    armScores[label] = s;
    const b = (k) => (s.buckets[k] ? `${s.buckets[k].caught}/${s.buckets[k].total}` : "—");
    const tok = args.tokens[label] && s.caught.size ? `${Math.round(args.tokens[label] / s.caught.size / 100) / 10}k` : "—";
    p(`| ${label} | **${pct(s.recall)}** (${s.caught.size}/${applicable.length}) | ${b("easy")} | ${b("medium")} | ${b("hard")} | ${pct(s.precision)} | ${s.matched}/${s.findings} | ${tok} |`);
  }
  p("");

  // Recall lift vs the cold baseline (first arm = baseline by convention).
  if (args.arms.length >= 2) {
    const baseLabel = args.arms[0].label;
    const base = armScores[baseLabel];
    p(`## Recall lift vs cold arm "${baseLabel}"`);
    p("");
    for (const { label } of args.arms.slice(1)) {
      const s = armScores[label];
      const lift = s.recall - base.recall;
      const verdict =
        lift >= 0.2 && s.precision >= base.precision
          ? `**EARNS ITS KEEP** — +${(lift * 100).toFixed(0)}pp recall, precision not worse. Token cost is irrelevant to this decision.`
          : lift > 0
            ? `marginal — +${(lift * 100).toFixed(0)}pp recall; below the +20pp keep bar or precision regressed. Re-run at N≥8 before judging.`
            : `no recall lift (${(lift * 100).toFixed(0)}pp). If reproducible at N≥8, this is genuine bloat — trim or retire.`;
      p(`- **${label}** vs **${baseLabel}**: recall ${pct(base.recall)} → ${pct(s.recall)} (${lift >= 0 ? "+" : ""}${(lift * 100).toFixed(0)}pp). ${verdict}`);
    }
    p("");
  }

  // Reproducibility
  if (args.repro.length) {
    p(`## Reproducibility (caught-defect-set Jaccard across repeated runs)`);
    p("");
    for (const { label, files } of args.repro) {
      const sets = files.map((f) => scoreArm(applicable, loadFindings(f)).caught);
      const pairs = [];
      for (let i = 0; i < sets.length; i++)
        for (let j = i + 1; j < sets.length; j++) pairs.push(jaccard(sets[i], sets[j]));
      const mean = pairs.reduce((a, b) => a + b, 0) / pairs.length;
      const min = Math.min(...pairs);
      const flag = min >= 0.8 ? "✓ trustworthy as a gate" : "⚠ unstable — different findings each run; not gate-ready";
      p(`- **${label}** over ${files.length} runs: Jaccard mean ${mean.toFixed(2)}, min ${min.toFixed(2)} — ${flag}`);
    }
    p("");
  }

  // Unmatched findings — candidate real bugs OR false positives (human adjudication)
  p(`## Unmatched findings (human adjudication: real unseeded bug, or false positive?)`);
  p("");
  let anyUnmatched = false;
  for (const { label } of args.arms) {
    const s = armScores[label];
    if (!s.unmatched.length) continue;
    anyUnmatched = true;
    p(`**${label}** — ${s.unmatched.length}:`);
    for (const f of s.unmatched) p(`  - ${f.file}${f.line ? `:${f.line}` : ""} — ${f.claim}`);
  }
  if (!anyUnmatched) p("_none_");
  p("");

  // Missed defects, per arm — what the skill should have caught
  p(`## Missed seeded defects (per arm)`);
  p("");
  for (const { label } of args.arms) {
    const s = armScores[label];
    const missed = applicable.filter((d) => !s.caught.has(d.id));
    p(`**${label}** missed ${missed.length}/${applicable.length}: ${missed.map((d) => `\`${d.id}\`(${d.difficulty})`).join(", ") || "none"}`);
  }
  p("");

  const report = lines.join("\n");
  if (args.out) {
    writeFileSync(args.out, report);
    console.log(`Wrote ${args.out}`);
  } else {
    console.log(report);
  }
}

main();
