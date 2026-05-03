// Operator-readiness check for the spacepotatis.save_audit forensic table
// (added in PR #98). Tells the human whether enough rows have accumulated to
// inform the next-session structural fix — the append-only save_snapshots
// architecture sketched in TODO.md "Phase Save-Architecture".
//
// THE THREE THRESHOLDS (with rationale):
//   1. total_rows >= 100
//      A sample large enough that payload-shape outliers will appear. Below
//      ~100 rows the data is mostly one player's repeated saves, which biases
//      the design toward that player's loadout shape.
//   2. distinct_players >= 2
//      One account never proves the wire format generalizes. A second account
//      surfaces auth-tied edge cases (cross-tab races, fresh-handle saves,
//      different ship configs). It also rules out "the queries only work for
//      Mikko's row".
//   3. days_of_data >= 3
//      Covers at least one weekend cycle. Players' usage shapes differ on
//      weekdays vs. weekends; a single 24h sample misses idle-tab churn,
//      multi-session resumes, and the cross-day TZ rollover.
//
// EXIT CODES (the GH Actions workflow branches on these):
//   0 = READY (all thresholds met) -> workflow opens a tracking issue
//   1 = NOT YET (one or more unmet) -> workflow logs + exits green
//   2 = ENV ERROR (no DATABASE_URL, connection failed) -> workflow fails loudly
//
// USAGE:
//   Manual: node --env-file=.env.local scripts/check-audit-readiness.mjs
//   Cron:   .github/workflows/audit-readiness-check.yml runs it daily at
//           07:00 UTC and on workflow_dispatch.

import { Pool } from "@neondatabase/serverless";

export const DEFAULT_THRESHOLDS = Object.freeze({
  totalRows: 100,
  distinctPlayers: 2,
  daysOfData: 3,
});

// Pure helper: given the row from the COUNT/MIN/MAX/etc. query and a thresholds
// object, return the verdict + which thresholds (if any) are unmet. Tested in
// isolation by check-audit-readiness.test.mjs so the logic is verifiable
// without a live DB.
export function evaluateReadiness(row, thresholds = DEFAULT_THRESHOLDS) {
  const totalRows = Number(row?.total_rows ?? 0);
  const distinctPlayers = Number(row?.distinct_players ?? 0);
  const daysOfData = Number(row?.days_of_data ?? 0);

  const checks = [
    {
      name: "total_rows",
      actual: totalRows,
      required: thresholds.totalRows,
      pass: totalRows >= thresholds.totalRows,
    },
    {
      name: "distinct_players",
      actual: distinctPlayers,
      required: thresholds.distinctPlayers,
      pass: distinctPlayers >= thresholds.distinctPlayers,
    },
    {
      name: "days_of_data",
      actual: daysOfData,
      required: thresholds.daysOfData,
      pass: daysOfData >= thresholds.daysOfData,
    },
  ];

  const unmet = checks.filter((c) => !c.pass).map((c) => c.name);
  const ready = unmet.length === 0;

  return { ready, unmet, checks };
}

export function formatReport(row, evaluation) {
  const lines = [];
  lines.push("save_audit readiness check");
  lines.push("==========================");
  lines.push("");

  const totalRows = Number(row?.total_rows ?? 0);
  if (totalRows === 0) {
    lines.push("(table is empty — no save attempts have been audited yet)");
    lines.push("");
  } else {
    lines.push(`total_rows:         ${totalRows}`);
    lines.push(`distinct_players:   ${row?.distinct_players ?? 0}`);
    lines.push(`first_audit:        ${formatTimestamp(row?.first_audit)}`);
    lines.push(`latest_audit:       ${formatTimestamp(row?.latest_audit)}`);
    lines.push(`days_of_data:       ${row?.days_of_data ?? 0}`);
    lines.push(`avg_payload_bytes:  ${row?.avg_payload_bytes ?? 0}`);
    lines.push("");
    lines.push("response status distribution:");
    lines.push(`  204 (success):    ${row?.successes ?? 0}`);
    lines.push(`  422 (rejected):   ${row?.rejections ?? 0}`);
    lines.push(`  >=500 (errors):   ${row?.server_errors ?? 0}`);
    lines.push("");
  }

  lines.push("threshold checks:");
  for (const check of evaluation.checks) {
    const mark = check.pass ? "[OK]" : "[--]";
    lines.push(
      `  ${mark} ${check.name}: ${check.actual} / ${check.required}`,
    );
  }
  lines.push("");

  if (evaluation.ready) {
    lines.push("STATUS: READY");
  } else {
    lines.push(`STATUS: NOT YET (waiting for: ${evaluation.unmet.join(", ")})`);
  }

  return lines.join("\n");
}

function formatTimestamp(value) {
  if (value === null || value === undefined) return "(none)";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

const QUERY = `
  SELECT
    COUNT(*) AS total_rows,
    COUNT(DISTINCT player_id) AS distinct_players,
    MIN(created_at) AS first_audit,
    MAX(created_at) AS latest_audit,
    ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 86400, 2) AS days_of_data,
    ROUND(AVG(pg_column_size(request_payload))) AS avg_payload_bytes,
    COUNT(*) FILTER (WHERE response_status = 204) AS successes,
    COUNT(*) FILTER (WHERE response_status = 422) AS rejections,
    COUNT(*) FILTER (WHERE response_status >= 500) AS server_errors
  FROM spacepotatis.save_audit;
`;

async function main() {
  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(
      "DATABASE_URL not set. Pass it via .env.local or the environment, e.g.\n" +
        "  node --env-file=.env.local scripts/check-audit-readiness.mjs",
    );
    process.exit(2);
  }

  const pool = new Pool({ connectionString: dbUrl });
  try {
    const { rows } = await pool.query(QUERY);
    const row = rows[0] ?? {};
    const evaluation = evaluateReadiness(row);
    console.log(formatReport(row, evaluation));
    process.exit(evaluation.ready ? 0 : 1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`save_audit query failed: ${message}`);
    process.exit(2);
  } finally {
    await pool.end();
  }
}

// Only run main() when this file is invoked directly (e.g. via
// `node scripts/check-audit-readiness.mjs`). Tests / consumers that import
// evaluateReadiness or formatReport must NOT trigger the DB connection.
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

function isInvokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  await main();
}
