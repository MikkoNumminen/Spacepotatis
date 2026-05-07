// One-shot READ-ONLY: enumerate distinct mission_ids in spacepotatis.leaderboard.
// SEC-003 prereq — checks for retired ids before tightening the GET param to MissionIdSchema.
import { Pool } from "@neondatabase/serverless";

const MISSION_IDS = [
  "tutorial",
  "combat-1",
  "boss-1",
  "shop",
  "market",
  "pirate-beacon",
  "ember-run",
  "burnt-spud",
  "tubernovae-outpost"
];

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: dbUrl });

try {
  const { rows: allRows } = await pool.query(
    `SELECT mission_id, COUNT(*)::int AS row_count
     FROM spacepotatis.leaderboard
     GROUP BY mission_id
     ORDER BY mission_id`
  );
  console.log("All distinct mission_ids in leaderboard:");
  if (allRows.length === 0) {
    console.log("  (no leaderboard rows at all)");
  } else {
    for (const r of allRows) console.log("  ", r.mission_id, "—", r.row_count, "rows");
  }

  const retired = allRows.filter(r => !MISSION_IDS.includes(r.mission_id));
  console.log("\nRetired mission_ids (not in current MISSION_IDS):");
  if (retired.length === 0) {
    console.log("  (none — safe to enable MissionIdSchema strict-validate at GET)");
  } else {
    for (const r of retired) console.log("  ", r.mission_id, "—", r.row_count, "rows");
    console.log("\n  Tightening would close public read for these ids.");
  }
} finally {
  await pool.end();
}
