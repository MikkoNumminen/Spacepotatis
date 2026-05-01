import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SEEN_STORIES_LOCAL_KEY,
  readSeenStoriesLocal,
  writeSeenStoriesLocal
} from "./seenStoriesLocal";
import { STORY_IDS } from "@/game/data/story";

// Pick a real story id so isKnownStoryId() inside readSeenStoriesLocal does
// not silently filter out our fixture. The first registered entry is good
// enough — the tests don't depend on its semantic meaning.
const knownStoryId = (() => {
  const first = STORY_IDS[0];
  if (!first) throw new Error("fixture broken: story registry is empty");
  return first;
})();

// jsdom-free polyfill: the test environment is "node" (see vitest.config.ts),
// so window/localStorage do not exist by default. Each test stubs them where
// needed and restores via vi.unstubAllGlobals in afterEach.
function makeFakeLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    api: {
      getItem: vi.fn((k: string) => (store.has(k) ? (store.get(k) as string) : null)),
      setItem: vi.fn((k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: vi.fn((k: string) => {
        store.delete(k);
      }),
      clear: vi.fn(() => store.clear()),
      key: vi.fn(() => null),
      length: 0
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readSeenStoriesLocal", () => {
  it("returns the JSON array verbatim when localStorage has a valid list of known ids", () => {
    const fake = makeFakeLocalStorage({
      [SEEN_STORIES_LOCAL_KEY]: JSON.stringify([knownStoryId])
    });
    vi.stubGlobal("window", { localStorage: fake.api });
    expect(readSeenStoriesLocal()).toEqual([knownStoryId]);
  });

  it("returns an empty array when the entry is missing", () => {
    const fake = makeFakeLocalStorage();
    vi.stubGlobal("window", { localStorage: fake.api });
    expect(readSeenStoriesLocal()).toEqual([]);
  });

  it("returns an empty array (no throw) when JSON is corrupt", () => {
    const fake = makeFakeLocalStorage({ [SEEN_STORIES_LOCAL_KEY]: "not-json{" });
    vi.stubGlobal("window", { localStorage: fake.api });
    expect(readSeenStoriesLocal()).toEqual([]);
  });

  it("returns an empty array when typeof window === 'undefined' (SSR/Edge path)", () => {
    // In the node test env window is already undefined; assert the guard
    // produces the empty array without crashing on missing localStorage.
    expect(typeof window).toBe("undefined");
    expect(readSeenStoriesLocal()).toEqual([]);
  });

  it("returns an empty array when the parsed JSON is not an array (e.g. an object literal)", () => {
    const fake = makeFakeLocalStorage({
      [SEEN_STORIES_LOCAL_KEY]: JSON.stringify({ [knownStoryId]: true })
    });
    vi.stubGlobal("window", { localStorage: fake.api });
    expect(readSeenStoriesLocal()).toEqual([]);
  });

  it("filters out unknown story ids while keeping known ones", () => {
    const fake = makeFakeLocalStorage({
      [SEEN_STORIES_LOCAL_KEY]: JSON.stringify([knownStoryId, "ghost-id-not-real"])
    });
    vi.stubGlobal("window", { localStorage: fake.api });
    expect(readSeenStoriesLocal()).toEqual([knownStoryId]);
  });
});

describe("writeSeenStoriesLocal", () => {
  it("writes the JSON-stringified array to localStorage under the canonical key", () => {
    const fake = makeFakeLocalStorage();
    vi.stubGlobal("window", { localStorage: fake.api });
    writeSeenStoriesLocal([knownStoryId]);
    expect(fake.api.setItem).toHaveBeenCalledTimes(1);
    expect(fake.api.setItem).toHaveBeenCalledWith(
      SEEN_STORIES_LOCAL_KEY,
      JSON.stringify([knownStoryId])
    );
    expect(fake.store.get(SEEN_STORIES_LOCAL_KEY)).toBe(JSON.stringify([knownStoryId]));
  });

  it("writes an empty array as '[]' rather than deleting the key", () => {
    const fake = makeFakeLocalStorage();
    vi.stubGlobal("window", { localStorage: fake.api });
    writeSeenStoriesLocal([]);
    expect(fake.api.setItem).toHaveBeenCalledWith(SEEN_STORIES_LOCAL_KEY, "[]");
    expect(fake.api.removeItem).not.toHaveBeenCalled();
  });

  it("swallows the throw and console.warns when setItem rejects (private mode / quota)", () => {
    const quotaErr = new Error("QuotaExceededError");
    const fake = makeFakeLocalStorage();
    fake.api.setItem.mockImplementation(() => {
      throw quotaErr;
    });
    vi.stubGlobal("window", { localStorage: fake.api });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => writeSeenStoriesLocal([knownStoryId])).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    const [msg, errArg] = warn.mock.calls[0] ?? [];
    expect(String(msg)).toContain("[seenStoriesLocal]");
    expect(errArg).toBe(quotaErr);
  });

  it("is a no-op (no throw) when typeof window === 'undefined'", () => {
    expect(typeof window).toBe("undefined");
    expect(() => writeSeenStoriesLocal([knownStoryId])).not.toThrow();
  });
});

describe("SEEN_STORIES_LOCAL_KEY", () => {
  it("is the documented namespaced key (canary against accidental rename)", () => {
    // Renaming this would orphan every existing player's persisted seen-set;
    // pin it so a refactor surfaces the breakage in CI before shipping.
    expect(SEEN_STORIES_LOCAL_KEY).toBe("spacepotatis:seenStoryEntries");
  });
});

// Re-import bookkeeping: vi.resetModules is unnecessary here — the SUT does
// not cache module-level state derived from window. beforeEach is empty by
// design; afterEach handles the global restore.
beforeEach(() => undefined);
