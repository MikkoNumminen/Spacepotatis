"use client";

// Module-level cache + in-flight de-dup for /api/save GET responses.
//
// Why this is a separate file from sync.ts:
//
// sync.ts imports `RemoteSaveSchema` from `@/lib/schemas/save` (~98 kB of
// Zod machinery in the client bundle). The components that only need the
// cache surface — landing's `<SignInButton>` (calls `clearLoadSaveCache`
// on sign-out), the CONTINUE label's `useOptimisticAuth` (`getSaveCache`),
// and the splash gate's `useCloudSaveSync` (`isSaveCached`) — should NOT
// drag Zod into their first-load chunk just to read three module-level
// booleans.
//
// By isolating the cache state + accessors here, the landing route's
// first-load JS drops by ~98 kB and the bundle analyzer confirms Zod is
// only loaded by routes that actually parse a server payload (/play and
// /shop's lazy-loaded chunks).
//
// State ownership rule: ONLY this file mutates `cached` / `inflight`.
// sync.ts feeds them via the setters below — a single source of truth so
// the cache invariant ("after a successful POST, cached=true") can't be
// re-implemented in a stale shape elsewhere.

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function clearLoadSaveCache(): void {
  cached = null;
  inflight = null;
}

// Read-only window into the cache. Hooks seed React initial state from
// these so a hot remount (e.g. nav between / and /play) can render with
// ready=true on the very first frame, skipping the splash.
export function isSaveCached(): boolean {
  return cached !== null;
}

export function getSaveCache(): boolean | null {
  return cached;
}

// Internal mutators — called from sync.ts's loadSave/saveNow when a fresh
// server response is observed.
export function setSaveCache(value: boolean): void {
  cached = value;
}

export function getInflightLoad(): Promise<boolean> | null {
  return inflight;
}

export function setInflightLoad(p: Promise<boolean> | null): void {
  inflight = p;
}
