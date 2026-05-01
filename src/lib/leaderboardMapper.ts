import type { PilotEntry } from "./leaderboard";

// Raw row shape returned by the fetchTopPilots Kysely query. The handle
// column is nullable (`p.handle is not null` filters most rows but the
// type system still surfaces `string | null`); the COALESCE numeric fields
// arrive as Postgres `number | string | bigint` depending on driver.
export interface TopPilotsRow {
  handle: string | null;
  clears: number | string | bigint;
  playtime: number | string | bigint;
  best_score: number | string | bigint;
}

// Pure row → Pilot mapper. Anonymous players (null handle) collapse to a
// generic "Pilot" label. Numeric counters coerce through Number() so the
// mapper survives both `bigint`-flavored Postgres returns and pre-stringified
// values from a JSON test fixture.
export function mapRowToPilot(row: TopPilotsRow): PilotEntry {
  return {
    handle: row.handle ?? "Pilot",
    clears: Number(row.clears),
    playtimeSeconds: Number(row.playtime),
    bestScore: Number(row.best_score)
  };
}
