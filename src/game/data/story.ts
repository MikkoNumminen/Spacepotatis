// Story log — narrative beats shown as cinematic popups. The first entry
// auto-fires on the player's first galaxy-view load; future entries can
// gate on mission completions or other progression events.
//
// Each entry carries its own music + voice tracks (paths under /public/audio/story).
// The voice is offset by `voiceDelayMs` so the music establishes the mood
// before narration kicks in.

export type StoryId = "great-potato-awakening";

export interface StoryEntry {
  readonly id: StoryId;
  readonly title: string;
  readonly body: readonly string[];
  readonly musicTrack: string;
  readonly voiceTrack: string;
  readonly voiceDelayMs: number;
  readonly autoTrigger: { readonly kind: "first-time" } | null;
}

export const STORY_ENTRIES: readonly StoryEntry[] = [
  {
    id: "great-potato-awakening",
    title: "The Great Potato Awakening",
    body: [
      "Long ago, in a quiet Finnish garden, a humble potato grew tired of being mashed. So it did what any self-respecting tuber would do — it grew engines, sprouted lasers, and launched itself into space.",
      "Now it fights the bugs. For all potatoes. Forever."
    ],
    musicTrack: "/audio/story/great-potato-awakening-music.ogg",
    voiceTrack: "/audio/story/great-potato-awakening-voice.mp3",
    voiceDelayMs: 3000,
    autoTrigger: { kind: "first-time" }
  }
];

export const STORY_IDS: readonly StoryId[] = STORY_ENTRIES.map((e) => e.id);

export function getStoryEntry(id: StoryId): StoryEntry {
  const entry = STORY_ENTRIES.find((e) => e.id === id);
  if (!entry) throw new Error(`Unknown story id: ${id}`);
  return entry;
}

export function isKnownStoryId(value: unknown): value is StoryId {
  return typeof value === "string" && STORY_IDS.includes(value as StoryId);
}
