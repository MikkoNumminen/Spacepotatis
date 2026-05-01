import { isKnownStoryId, type StoryId } from "@/game/data/story";

// Browser-local backup of the seen-story list. Read at module init so
// INITIAL_STATE has the right value before any cloud-save logic runs —
// the popup must NEVER re-fire on the same device after the player has
// already watched it. Hydrate merges this with the server list too, so
// cross-device sync still works once persistence is healthy.
export const SEEN_STORIES_LOCAL_KEY = "spacepotatis:seenStoryEntries";

export function readSeenStoriesLocal(): readonly StoryId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEEN_STORIES_LOCAL_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isKnownStoryId);
  } catch {
    // Corrupt localStorage shouldn't crash the app; "no seen stories" is a
    // safe default and the cloud-save merge will repair it on next hydrate.
    return [];
  }
}

export function writeSeenStoriesLocal(ids: readonly StoryId[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_STORIES_LOCAL_KEY, JSON.stringify(ids));
  } catch (err) {
    // localStorage may be disabled (private mode, quota); the in-memory
    // session-level fire-once guard in GameCanvas covers this case.
    console.warn("[seenStoriesLocal] write failed; seen-set won't persist", err);
  }
}
