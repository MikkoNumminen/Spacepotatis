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
//   { kind: "on-shop-open" }                      — fires every time the player lands
//                                                   on /shop (seen-mark is once-only)
//   { kind: "on-system-enter", systemId: ... }   — fires once the first time the
//                                                   player's currentSolarSystemId
//                                                   becomes the named system
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
//
// `body` is what Grandma reads aloud (kept short so the narration breathes).
// `logSummary` is the written, deeper synopsis surfaced in the Story log
// list — it can go further than the spoken track: lore, context,
// foreshadowing, what's at stake. Each string renders as its own paragraph.

export type StoryId =
  | "great-potato-awakening"
  | "spud-prime-arrival"
  | "yamsteroid-belt-arrival"
  | "dreadfruit-arrival"
  | "market-arrival"
  | "sol-spudensis-cleared"
  | "tubernovae-cluster-intro";

export type StoryAutoTrigger =
  | { readonly kind: "first-time" }
  | { readonly kind: "on-mission-select"; readonly missionId: MissionId }
  | { readonly kind: "on-shop-open" }
  | { readonly kind: "on-system-enter"; readonly systemId: SolarSystemId }
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
  readonly logSummary: readonly string[];
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
    logSummary: [
      "It started in a fenced patch of dirt outside Tampere, somewhere between the dill and the rhubarb. Generations of tubers had been pulled, peeled, and turned into mash without complaint. One spud — your spud — looked up through the loose soil one September evening and decided that was the end of that.",
      "What followed was less of a plan and more of a refusal. Roots curled into thrust nozzles. Eyes bristled into targeting optics. The garden gate did not survive. Neither did the satellite the launch bruised on its way up.",
      "Up there in the dark the potato found something worse than peelers waiting: the bugs. They had already chewed through three tuber colonies before anyone noticed. So the war became simple. For all potatoes. Forever."
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
    logSummary: [
      "Spud Prime is home. A warm, agriculturally smug little world ringed with greenhouse domes and root-cellar bunkers, the founding colony of every tuber that ever drew breath. If it falls, there is nothing to fall back to.",
      "The bug scouts that just hit the upper atmosphere are not a serious raid yet — a probing claw, a few scout swarms checking whether anyone is home. They are checking if anyone is home. The answer needs to be loud.",
      "Mission Control is using this run to clock your reflexes as much as the enemy's. Survive Spud Prime cleanly and the rest of the system opens up."
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
    logSummary: [
      "The Yamsteroid Belt is a slow tumbling river of starch-rich rock that loops around Sol Spudensis like a cracked bracelet. Most of it is harmless ballast. A meaningful fraction of it is hollow.",
      "Bugs love the belt. The rocks shield their hatcheries from radiation, the low gravity lets larvae drift between stones, and any debris cloud doubles as cover for an ambush wing. Expect chitin scouts hugging the rocks, hatchery clusters glued to the larger asteroids, and the occasional surprise drone that mistook your hull for a mating call.",
      "Mission Control wants the nests cracked before they spore-bloom into something worse. Stay moving, mind your flanks, and don't get pinned against a rock."
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
    logSummary: [
      "Dreadfruit is not a planet so much as it is a tuber that grew until physics complained. Its skin is purple-black, bruised with hive structures, and warm to the touch even from orbit. Long-range scans say there is something pulsing at the core. Scans agree it is not happy.",
      "At the centre sits the Aphid Empress — old, vast, and aware that you are coming. Her drones are organized now, not the loose swarms of the belt. Expect coordinated waves, layered defences, and a final push when you breach the inner crust.",
      "This is the first real wall in your campaign. Bring the loadout you trust most. Whatever falls in this fight stays fallen, and what's left of the hive after the Empress goes will scatter into the next system."
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
    logSummary: [
      "The Market is a hollowed-out chunk of yamsteroid, lashed to a derelict freight hub by stubborn welds and even more stubborn shopkeepers. Somehow it stays open while the rest of the system burns.",
      "Inside you'll find weapons in mismatched racks, hull plates stacked like firewood, and a counter where someone's grandmother sells reactor cells next to a jar of pickled beets. Prices are fair. The mood is friendlier than the war outside has any right to allow.",
      "Stop in between missions. Sell what you don't need, buy what you do, and listen — the Market hears every rumour in the system before Mission Control does."
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
    logSummary: [
      "Sol Spudensis is quiet for the first time in living memory. Spud Prime is intact, the Yamsteroid hatcheries are slag, and Dreadfruit is a hollowed-out shell drifting in a cooling halo of bug-glass.",
      "What was at stake here was not just the home system — it was the question of whether tubers could fight back at all. The answer is sitting in your cockpit, slightly singed and looking smug.",
      "The next chapter waits in the Tubernovae system, further out and meaner. Take a moment in the calm. The bugs there have already heard what happened here, and they are not going to be polite about it."
    ],
    musicTrack: null,
    voiceTrack: "/audio/story/sol-spudensis-cleared-voice.mp3",
    voiceDelayMs: 0,
    autoTrigger: { kind: "on-system-cleared-idle", systemId: "tutorial", initialDelayMs: 5000, intervalMs: 30000 },
    mode: "overlay"
  },
  {
    id: "tubernovae-cluster-intro",
    title: "The Armed Harvest",
    body: [
      "For a thousand harvests, the Spud knew only victory.",
      "We rooted into worlds and they yielded. Soil softened. Skies thickened with our spores. Civilizations bowed their heads, and we, in our gentle, starchy way, ate them. Not cruelly. Just thoroughly.",
      "But the Tubernovae Cluster is not soil. It is rust.",
      "The pirates do not bleed sap. They bleed coolant. Their ships are not grown — they are welded. Their weapons do not wither in our atmospheres; they cut, and what they cut does not regrow. Three of our scouts came back as mash. The fourth came back as nothing.",
      "And so, in the quiet hum of the Tubernovae Outpost — surrounded by the wares of dead races and the soft glow of stolen reactors — the Spud has made a decision that no Spud before has ever had to make.",
      "We will take what they have.",
      "Not eat it. Wear it.",
      "The first volunteers are already in the surgery vats. Plating, bolted into skin that was meant to be peeled. Servos, threaded through stolons. A targeting array, salvaged from a pirate cruiser, grafted directly into the eye of an old, proud tuber who once won the Kepler Sprouting Championships three years running.",
      "He says he is honored. He says he can see the heat of stars now.",
      "Some of us are afraid this is the end of who we are.",
      "Most of us are afraid of mash.",
      "Captain — your potato_pilot designation has been upgraded. Your hull is no longer purely biological. The pirates wired their stars together with that beacon out there; cut it down, and we begin the harder work — learning to be what we eat.",
      "And what we eat, now, has teeth."
    ],
    logSummary: [
      "For a thousand harvests, the Spud knew only victory. We rooted into worlds and they yielded. Soil softened. Skies thickened with our spores. Civilizations bowed their heads, and we, in our gentle, starchy way, ate them. Not cruelly. Just thoroughly.",
      "But the Tubernovae Cluster is not soil. It is rust. The pirates do not bleed sap. They bleed coolant. Their ships are not grown — they are welded. Their weapons do not wither in our atmospheres; they cut, and what they cut does not regrow. Three of our scouts came back as mash. The fourth came back as nothing.",
      "And so, in the quiet hum of the Tubernovae Outpost — surrounded by the wares of dead races and the soft glow of stolen reactors — the Spud has made a decision that no Spud before has ever had to make. We will take what they have. Not eat it. Wear it.",
      "The first volunteers are already in the surgery vats. Plating, bolted into skin that was meant to be peeled. Servos, threaded through stolons. A targeting array, salvaged from a pirate cruiser, grafted directly into the eye of an old, proud tuber who once won the Kepler Sprouting Championships three years running. He says he is honored. He says he can see the heat of stars now.",
      "Some of us are afraid this is the end of who we are. Most of us are afraid of mash.",
      "Captain — your potato_pilot designation has been upgraded. Your hull is no longer purely biological. The pirates wired their stars together with that beacon out there; cut it down, and we begin the harder work — learning to be what we eat. And what we eat, now, has teeth."
    ],
    musicTrack: "/audio/story/tubernovae-cluster-intro-music.ogg",
    voiceTrack: "/audio/story/tubernovae-cluster-intro-voice.mp3",
    voiceDelayMs: 3000,
    autoTrigger: { kind: "on-system-enter", systemId: "tubernovae" },
    mode: "modal"
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
