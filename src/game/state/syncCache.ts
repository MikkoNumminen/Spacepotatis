"use client";

// Module-level cache + in-flight de-dup for /api/save GET responses, plus
// the "which account is signed in" + "did this session's load succeed yet"
// flags that gate saveNow.
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
// State ownership rule: ONLY this file mutates `cached` / `inflight` /
// `currentPlayerEmail`. sync.ts feeds them via the setters below — a single
// source of truth so the cache invariant ("after a successful POST,
// cached=true") can't be re-implemented in a stale shape elsewhere.

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;
// Set true ONLY when loadSave has positively determined the server's state
// for THIS browser session — either via a successful schema-parsed hydrate,
// a confirmed "no save row yet" (200 + null body), or an unauthenticated
// session (401). Failed parses, 5xx, and network errors leave it false.
//
// saveNow gates on this flag: when false, the in-memory GameState may still
// be at INITIAL_STATE (load failed silently, leaving GameState untouched),
// and POSTing that would WIPE the server's real save. The server-side
// regression guard in saveValidation.ts is the matching defense — if this
// flag fails open for any reason, the server still rejects the wipe.
let hydrationCompleted = false;
// Lower-cased email of the currently signed-in player. Set by the auth
// hook (useCloudSaveSync) the moment NextAuth resolves to authenticated,
// nulled on unauthenticated. saveQueue uses this to stamp every pending
// save and to gate reads — a snapshot stamped for a@example.com is
// invisible while b@example.com is signed in.
//
// On account swap (the email changes to a different non-null value or to
// null), hydrationCompleted resets to false. The previous account's
// loadSave does NOT prove the new account's server state, and saveNow
// must refuse to POST until the new account's loadSave lands.
let currentPlayerEmail: string | null = null;

export function clearLoadSaveCache(): void {
  cached = null;
  inflight = null;
  hydrationCompleted = false;
  currentPlayerEmail = null;
}

export function isHydrationCompleted(): boolean {
  return hydrationCompleted;
}

export function markHydrationCompleted(): void {
  hydrationCompleted = true;
}

// Explicitly reset the hydration flag. Called on sign-in so a saveNow
// between sign-in and the first loadSave can't POST INITIAL_STATE under
// the new account (the previous session's hydration might still be true).
export function resetHydrationCompleted(): void {
  hydrationCompleted = false;
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

// Current player accessors. The setter is intentionally destructive: when
// the email transitions to a different value (or to null), it also wipes
// the per-account hydration flag and the save-cache boolean — neither was
// proven for the new account.
export function getCurrentPlayerEmail(): string | null {
  return currentPlayerEmail;
}

export function setCurrentPlayerEmail(email: string | null): void {
  if (currentPlayerEmail === email) return;
  currentPlayerEmail = email;
  // Account changed (sign-in, sign-out, or rare swap on the same browser).
  // Anything we believed about "the server's state for THIS session" was
  // about the OLD account; refusing to POST until the new account's
  // loadSave lands is the only safe stance.
  hydrationCompleted = false;
  cached = null;
  inflight = null;
}
