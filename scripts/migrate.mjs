#!/usr/bin/env node
// Tiny dbmate-compatible migration runner.
//
// Why: dbmate is a Go binary; not every contributor (or Windows box) has it
// installed. This script does the only two things we actually need from it:
// apply pending `-- migrate:up` blocks from db/migrations/*.sql, and stamp
// public.spacepotatis_schema_migrations so dbmate-proper agrees with us
// about what's been applied.
//
// Reads DATABASE_URL_UNPOOLED (preferred for DDL) or DATABASE_URL from the
// process environment, loaded by node --env-file=.env.local. Run via
// `npm run db:migrate:node` so the env file is wired up.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

// Node 22+ has native WebSocket; @neondatabase/serverless picks it up
// automatically, so no `ws` polyfill is needed.

const TRACKER_TABLE = "public.spacepotatis_schema_migrations";
const MIGRATIONS_DIR = "db/migrations";

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL_UNPOOLED (or DATABASE_URL) must be set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

async function main() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${TRACKER_TABLE} (version VARCHAR(255) PRIMARY KEY)`
  );

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows: appliedRows } = await pool.query(
    `SELECT version FROM ${TRACKER_TABLE}`
  );
  const applied = new Set(appliedRows.map((r) => r.version));

  let appliedCount = 0;
  for (const file of files) {
    const version = file.split("_")[0];
    if (!version) continue;
    if (applied.has(version)) continue;

    const fullPath = join(MIGRATIONS_DIR, file);
    const content = await readFile(fullPath, "utf8");
    const upBlock = extractUpBlock(content);
    if (!upBlock.trim()) {
      console.warn(`skipping ${file}: no -- migrate:up block found`);
      continue;
    }

    process.stdout.write(`applying ${file}... `);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(upBlock);
      await client.query(`INSERT INTO ${TRACKER_TABLE} (version) VALUES ($1)`, [
        version
      ]);
      await client.query("COMMIT");
      console.log("ok");
      appliedCount++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.log("FAILED");
      throw err;
    } finally {
      client.release();
    }
  }

  if (appliedCount === 0) {
    console.log("nothing to apply — schema is up to date.");
  } else {
    console.log(`applied ${appliedCount} migration(s).`);
  }
}

// dbmate format: a `-- migrate:up` line followed by SQL, then a
// `-- migrate:down` line followed by the rollback. We only run `up`.
function extractUpBlock(content) {
  const upMarker = "-- migrate:up";
  const downMarker = "-- migrate:down";
  const upIdx = content.indexOf(upMarker);
  if (upIdx === -1) return content;
  const start = upIdx + upMarker.length;
  const downIdx = content.indexOf(downMarker, start);
  return downIdx === -1 ? content.slice(start) : content.slice(start, downIdx);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end().finally(() => process.exit(1));
  });
