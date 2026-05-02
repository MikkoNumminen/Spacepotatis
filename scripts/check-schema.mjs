// One-shot read-only schema check for the production Neon DB. Lists
// applied migrations and the columns of spacepotatis.save_games. Used to
// diagnose 500s on /api/save when a column referenced in the route doesn't
// exist on prod (i.e. a migration was added in code but never applied).
//
// Run via: node --env-file=.env.local scripts/check-schema.mjs
import { Pool } from "@neondatabase/serverless";

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: dbUrl });

try {
  const { rows: applied } = await pool.query(
    "SELECT version FROM public.spacepotatis_schema_migrations ORDER BY version"
  );
  console.log("applied migrations:");
  for (const r of applied) console.log("  ", r.version);

  const { rows: cols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='spacepotatis' AND table_name='save_games'
     ORDER BY ordinal_position`
  );
  console.log("\nspacepotatis.save_games columns:");
  for (const c of cols) console.log("  ", c.column_name);
} finally {
  await pool.end();
}
