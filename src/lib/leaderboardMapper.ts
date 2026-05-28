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

// Coerce a driver-shaped numeric (number | string | bigint, possibly null /
// undefined / garbage) into a finite JS number. bigint values above
// Number.MAX_SAFE_INTEGER silently lose precision when passed through
// Number(), so we clamp + warn instead of letting the wrong number out the
// front door. Anything that comes back non-finite (NaN from a bogus string,
// Infinity from a driver bug) collapses to the fallback.
function toFiniteNumber(
  v: unknown,
  field: string,
  fallback = 0
): number {
  if (typeof v === "bigint") {
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) {
      console.warn(
        `[leaderboardMapper] ${field} bigint exceeds MAX_SAFE_INTEGER; clamping`,
        v.toString()
      );
      return Number.MAX_SAFE_INTEGER;
    }
    if (v < BigInt(Number.MIN_SAFE_INTEGER)) {
      console.warn(
        `[leaderboardMapper] ${field} bigint below MIN_SAFE_INTEGER; clamping`,
        v.toString()
      );
      return Number.MIN_SAFE_INTEGER;
    }
    return Number(v);
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Pure row → Pilot mapper. Anonymous players (null handle) collapse to a
// generic "Pilot" label. Numeric counters route through toFiniteNumber so the
// mapper survives both `bigint`-flavored Postgres returns and pre-stringified
// values from a JSON test fixture without leaking NaN or precision loss.
export function mapRowToPilot(row: TopPilotsRow): PilotEntry {
  return {
    handle: row.handle ?? "Pilot",
    clears: toFiniteNumber(row.clears, "clears"),
    playtimeSeconds: toFiniteNumber(row.playtime, "playtime"),
    bestScore: toFiniteNumber(row.best_score, "best_score")
  };
}
