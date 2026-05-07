// Anonymous-progress cache.
//
// Why this exists:
//
//   - The per-account `saveQueue` deliberately rejects stamp-less snapshots
//     (see saveQueue.ts header — non-empty `playerEmail` is INV-QUEUE-1).
//     That guarantee closes a real cross-account leak vector and must NOT
//     be relaxed.
//
//   - But it leaves a hole: a user playing as guest, then clicking "Sign in
//     with Google", goes through a full OAuth page reload. The in-memory
//     `GameState` resets to `INITIAL_STATE` on module re-init, the
//     saveQueue could never persist the anonymous progress, and the
//     freshly-signed-in account starts with zero credits even though the
//     player just earned 100. That's the "MENI PERUNAPROGRESS HUKKAAN" bug
//     reported on 2026-04-26.
//
// The fix is a SECOND, orthogonal storage channel:
//
//   - Storage key: `STORAGE_KEY` (distinct from saveQueue's per-account
//     queue — these never share state).
//   - Writer: subscribes to GameState commits. Writes only when the user
//     is anonymous (`getCurrentPlayerEmail() === null`).
//   - Reader / claim: triggered exactly once, in sync.ts's `no-save`
//     branch — the only code path that knows the cloud has no row to
//     overwrite.
//
// Strict invariants:
//
//   1. We NEVER overwrite an existing cloud save. Claim only fires when
//      `loadSave` returns `kind: "no-save"` (literal 200 + null body).
//   2. The writer only writes while anonymous — authenticated commits go
//      through `saveNow` / saveQueue / cloud, never this cache.
//   3. The cache is cleared after consume (claim), and on sign-out (the
//      "scrub this device" gesture), and on a successful server-loaded
//      result (cloud is now this user's source of truth — guest progress
//      from a prior session is no longer relevant for this account).
//   4. Validation on read is structural only — Zod stays out of the hot
//      bundle path. The writer is the only producer; we trust its output
//      and rely on `hydrate()`'s missing-field tolerance for forward-compat.
//      Server-side storage is the actual security boundary; this module is
//      a UX feature, not a trust boundary.

"use client";

import { readAuthCache } from "@/lib/authCache";
import { subscribe } from "./stateCore";
import { hydrate, toSnapshot, type StateSnapshot } from "./persistence";
import { getCurrentPlayerEmail } from "./syncCache";

// `:v1` suffix in the key matches the convention used by saveQueue's
// `spacepotatis:pendingSave:v2`. Versioning the key (in addition to the
// inner `v: 1` field) means a future shape break can nuke a whole version
// atomically by removing the suffixed key, without risking a parser that
// trips over a half-migrated envelope.
const STORAGE_KEY = "spacepotatis:guest-progress:v1";
const SCHEMA_VERSION = 1;

interface GuestEnvelope {
  readonly v: number;
  readonly savedAtMs: number;
  readonly snapshot: StateSnapshot;
}

function isEnvelopeShape(value: unknown): value is GuestEnvelope {
  if (value === null || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  if (typeof e.v !== "number") return false;
  if (typeof e.savedAtMs !== "number") return false;
  if (e.snapshot === null || typeof e.snapshot !== "object") return false;
  return true;
}

// Synchronous, no-throw read. Returns null on absent / unparseable / version
// mismatch. The caller (claim, boot recovery) treats null as "no guest
// progress" — never as a failure to surface.
export function readGuestSnapshot(): StateSnapshot | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isEnvelopeShape(parsed)) return null;
  if (parsed.v !== SCHEMA_VERSION) return null;
  // We trust the inner shape because the writer is the only producer; the
  // hydrate() consumer downstream falls back to INITIAL_STATE for any
  // missing/unrecognized fields, so a partial snapshot can't corrupt state.
  return parsed.snapshot;
}

export function writeGuestSnapshot(snapshot: StateSnapshot): void {
  if (typeof window === "undefined") return;
  const envelope: GuestEnvelope = {
    v: SCHEMA_VERSION,
    savedAtMs: Date.now(),
    snapshot
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Quota / private mode / disk full — silently skip. The cache is a UX
    // affordance, never load-bearing for correctness.
  }
}

export function clearGuestSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same rationale as write — never let storage failures crash a flow.
  }
}

// Module-level guard so a second mount of the Providers tree (e.g. a hot
// reload, or a stray double-render in dev) doesn't re-bind the writer
// twice. The unsubscribe is idempotent — calling the returned cleanup more
// than once is harmless.
//
// Dev note: React 18 StrictMode runs effects mount → cleanup → mount in
// development. The cleanup flips `bound` back to false, so the second mount
// re-runs boot recovery and re-subscribes. That's idempotent — the snapshot
// it re-reads is the same one we just wrote, and `subscribe()` returns a
// fresh callback registration. There's a marginal extra read/write per
// mount in dev, but production never hits this path. Not worth a separate
// "did we already boot-recover?" flag.
let bound = false;

// Idempotent boot-side wiring:
//   1. If the user is anonymous AND the auth cache doesn't say they're a
//      returning authenticated user, hydrate from any persisted guest
//      snapshot. That makes guest progress survive a plain refresh too —
//      not just the OAuth redirect.
//   2. Subscribe future state commits. On every commit, if still anonymous,
//      persist the latest snapshot.
//
// Returns a cleanup that removes the subscription. Calling twice (without
// an intervening cleanup) returns a no-op cleanup.
export function bindGuestPersistenceOnce(): () => void {
  if (bound) return () => undefined;
  bound = true;

  // Boot recovery: only restore if we can be reasonably sure the user is in
  // an anonymous session. The auth cache check avoids a flicker — a
  // returning authenticated user would briefly see anon progress before
  // server-loaded overwrites it.
  //
  // We delegate to authCache.readAuthCache rather than substring-sniffing the
  // raw localStorage entry so this module isn't coupled to the auth cache's
  // serialization format. authCache has zero runtime deps so the import cost
  // is negligible.
  if (typeof window !== "undefined" && getCurrentPlayerEmail() === null) {
    const authCached = readAuthCache();
    if (authCached?.status !== "authenticated") {
      const cached = readGuestSnapshot();
      if (cached) hydrate(cached);
    }
  }

  const unsubscribe = subscribe(() => {
    if (typeof window === "undefined") return;
    if (getCurrentPlayerEmail() !== null) return;
    writeGuestSnapshot(toSnapshot());
  });

  return () => {
    bound = false;
    unsubscribe();
  };
}

// Test-only — reset the bound flag so a fresh test case can rebind. The
// production codepath calls `bindGuestPersistenceOnce` once per page load
// and never explicitly unbinds outside StrictMode tear-downs.
export function resetGuestPersistenceForTests(): void {
  bound = false;
}
