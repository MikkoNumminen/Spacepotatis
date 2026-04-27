import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearAuthCache, readAuthCache, writeAuthCache } from "./authCache";

const KEY = "spacepotatis:auth";

// Vitest in this repo runs with environment: "node", which has no `window`.
// Stub a minimal localStorage so the cache helpers exercise the same code
// path the browser hits, without pulling in jsdom for one test file.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(k: string): string | null {
    return this.store.get(k) ?? null;
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null;
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v);
  }
}

beforeEach(() => {
  // @ts-expect-error — augmenting global at runtime for the test only
  globalThis.window = { localStorage: new MemoryStorage() };
});

afterEach(() => {
  // @ts-expect-error — see above
  delete globalThis.window;
});

describe("authCache", () => {
  it("round-trips a snapshot through write → read", () => {
    writeAuthCache({ status: "authenticated", handle: "potato_pilot", hasSave: true });
    expect(readAuthCache()).toEqual({
      status: "authenticated",
      handle: "potato_pilot",
      hasSave: true
    });
  });

  it("stores nullable handle for accounts that haven't picked one yet", () => {
    writeAuthCache({ status: "authenticated", handle: null, hasSave: false });
    expect(readAuthCache()).toEqual({
      status: "authenticated",
      handle: null,
      hasSave: false
    });
  });

  it("returns null when no cache has been written", () => {
    expect(readAuthCache()).toBeNull();
  });

  it("clear() wipes a previously-written snapshot", () => {
    writeAuthCache({ status: "authenticated", handle: "x", hasSave: true });
    clearAuthCache();
    expect(readAuthCache()).toBeNull();
  });

  it("ignores entries with a stale schema version", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ v: 0, status: "authenticated", handle: "x", hasSave: true })
    );
    expect(readAuthCache()).toBeNull();
  });

  it("ignores entries with malformed status", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, status: "loading", handle: null, hasSave: false })
    );
    expect(readAuthCache()).toBeNull();
  });

  it("ignores entries with non-string handle", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, status: "authenticated", handle: 42, hasSave: false })
    );
    expect(readAuthCache()).toBeNull();
  });

  it("ignores invalid JSON", () => {
    window.localStorage.setItem(KEY, "{ not json");
    expect(readAuthCache()).toBeNull();
  });

  it("is SSR-safe — read/write/clear are no-ops without window", () => {
    // @ts-expect-error — temporarily remove the stub
    delete globalThis.window;
    expect(readAuthCache()).toBeNull();
    expect(() => writeAuthCache({ status: "authenticated", handle: null, hasSave: false })).not.toThrow();
    expect(() => clearAuthCache()).not.toThrow();
  });
});
