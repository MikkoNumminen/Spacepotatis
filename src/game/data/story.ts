import type { MissionId, SolarSystemId } from "@/types/game";

// Story log — narrative beats. Two presentation modes:
//
//   modal   (default): cinematic popup, ducks the menu bed, plays its own
//                       music + voice. Use for big story beats with text.
//   overlay:           voice plays on top of the menu bed, no popup, no
//                       music change. Use for short briefings tied to a
//                       specific in-game action (e.g. selecting a mission).
//
// Auto-fire kinds:
//   { kind: "first-time" }                       — fires once on first galaxy load
//   { kind: "on-mission-select", missionId: ... } — fires once when that mission's
//                                                   quest card is opened
//   { kind: "on-system-cleared-idle", systemId: ..., initialDelayMs: ..., intervalMs: ... }
//                                                — fires repeatedly while the player idles in
//                                                  the galaxy view of the named system AND
//                                                  every combat mission in that system has
//                                                  been completed
//   null                                          — replay-only via Story log
//
// Each entry carries a voice track and (for modal mode) a music bed. The
// voice is offset by `voiceDelayMs` so the music establishes the mood
// before narration kicks in. Overlay-mode entries set musicTrack: null
// since the menu bed is already playing.

export type StoryId =
  | "great-potato-awakening"
  | "spud-prime-arrival"
  | "yamsteroid-belt-arrival"
  | "dreadfruit-arrival"
  | "market-arrival"
  | "sol-spudensis-cleared";

export type StoryAutoTrigger =
  | { readonly kind: "first-time" }
  | { readonly kind: "on-mission-select"; readonly missionId: MissionId }
  | { readonly kind: "on-shop-open" }
  | {
      readonly kind: "on-system-cleared-idle";
      readonly systemId: SolarSystemId;
      readonly initialDelayMs: number;
      readonly intervalMs: number;
    };

export interface StoryEntry {
  readonly id: StoryId;
  readonly title: string;
  readonly body: readonly string[];
  readonly musicTrack: string | null;
  readonly voiceTrack: string;
  readonly voiceDelayMs: number;
  readonly autoTrigger: StoryAutoTrigger | null;
  readonly mode: "modal" | "overlay";
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
    autoTrigger: { kind: "first-time" },
    mode: "modal"
  },
  {
    id: "spud-prime-arrival",
    title: "Spud Prime Briefing",
    body: [
      "Mission Control breaks in over the comms as Spud Prime fills your viewscreen — first contact with the bug menace begins here."
    ],
    musicTrack: null,
    voiceTrack: "/audio/story/spud-prime-arrival-voice.mp3",
    voiceDelayMs: 0,
    autoTrigger: { kind: "on-mission-select", missionId: "tutorial" },
    mode: "overlay"
  },
  {
    id: "yamsteroid-belt-arrival",
    title: "Yamsteroid Belt Briefing",
    body: [
      "The Yamsteroid Belt opens up ahead — a churning field of rocks and bug nests. Mission Control reads off the threat profile."
    ],
    musicTrack: null,
    voiceTrack: "/audio/story/yamsteroid-belt-arrival-voice.mp3",
    voiceDelayMs: 0,
    autoTrigger: { kind: "on-mission-select", missionId: "combat-1" },
    mode: "overlay"
  },
  {
    id: "dreadfruit-arrival",
    title: "Dreadfruit Briefing",
    body: [
      "Dreadfruit fills the viewport — a planet-sized tuber crawling with the Aphid Empress's hive. Mission Control walks you through what's at the core."
    ],
    musicTrack: null,
    voiceTrack: "/audio/story/dreadfruit-arrival-voice.mp3",
    voiceDelayMs: 0,
    autoTrigger: { kind: "on-mission-select", missionId: "boss-1" },
    mode: "overlay"
  },
  {
    id: "market-arrival",
    title: "Market Arrival",
    body: [
      "You've docked at the Market — Mission Control runs through what's on the shelves."
    ],
    musicTrack: null,
    voiceTrack: "/audio/story/market-arrival-voice.mp3",
    voiceDelayMs: 0,
    autoTrigger: { kind: "on-shop-open" },
    mode: "overlay"
  },
  {
    id: "sol-spudensis-cleared",
    title: "Sol Spudensis Cleared",
    body: [
      "All threats in Sol Spudensis have been neutralized. Mission Control checks back in while the dust settles."
    ],
    musicTrack: null,
    voiceTrack: "/audio/story/sol-spudensis-cleared-voice.mp3",
    voiceDelayMs: 0,
    autoTrigger: { kind: "on-system-cleared-idle", systemId: "tutorial", initialDelayMs: 5000, intervalMs: 20000 },
    mode: "overlay"
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
