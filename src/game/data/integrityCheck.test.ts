import { describe, expect, it } from "vitest";

import {
  buildLiveIntegrityData,
  runDataIntegrityCheck,
  type IntegrityData
} from "./integrityCheck";
import { getAllMissions } from "./missions";
import type {
  AugmentDefinition
} from "./augments";
import type { LootPool } from "./lootPools";
import type { StoryEntry } from "./story";
import type {
  AugmentId,
  EnemyDefinition,
  MissionDefinition,
  MissionWaves,
  SolarSystemDefinition,
  WeaponDefinition,
  WeaponId
} from "@/types/game";

// Minimal-but-internally-consistent fixture. Each test starts from this and
// mutates the slice it cares about, so a single regression in the check
// surface (e.g. enemies-list lookup is wrong) doesn't cascade across every
// test as a confusing pass.
function fixture(): IntegrityData {
  const enemies: readonly EnemyDefinition[] = [
    {
      id: "aphid",
      name: "Aphid",
      hp: 8,
      speed: 70,
      behavior: "straight",
      scoreValue: 30,
      creditValue: 3,
      spriteKey: "enemy-aphid",
      fireRateMs: null,
      collisionDamage: 5
    }
  ];
  const weapons: readonly WeaponDefinition[] = [
    {
      id: "rapid-fire",
      name: "Potato Cannon",
      description: "Test weapon",
      damage: 6,
      fireRateMs: 120,
      bulletSpeed: 720,
      projectileCount: 1,
      spreadDegrees: 0,
      cost: 0,
      tint: "#4fd1ff",
      family: "potato",
      energyCost: 4
    }
  ];
  const augments: readonly AugmentDefinition[] = [
    {
      id: "damage-up",
      name: "Damage Booster",
      description: "Test augment",
      cost: 1000,
      tint: "#ff5566",
      damageMul: 1.25
    }
  ];
  const solarSystems: readonly SolarSystemDefinition[] = [
    {
      id: "tutorial",
      name: "Sol Spudensis",
      description: "Test system",
      sunColor: "#ffe9b8",
      sunSize: 1,
      ambientHue: "#1a1424",
      galaxyMusicTrack: "/audio/music/menu-theme.ogg"
    }
  ];
  const missions: readonly MissionDefinition[] = [
    {
      id: "tutorial",
      kind: "mission",
      name: "Spud Prime",
      description: "Test mission",
      difficulty: 1,
      texture: "/textures/planets/tutorial.jpg",
      solarSystemId: "tutorial",
      orbitRadius: 5.5,
      orbitSpeed: 0.16,
      startAngle: 0,
      scale: 1,
      requires: [],
      musicTrack: null
    }
  ];
  const lootPools: readonly LootPool[] = [
    {
      systemId: "tutorial",
      weapons: ["rapid-fire"],
      augments: ["damage-up"],
      upgrades: ["shield"],
      credits: { min: 100, max: 200 }
    }
  ];
  const missionWaves: readonly MissionWaves[] = [
    {
      missionId: "tutorial",
      waves: [
        {
          id: "tutorial-1",
          durationMs: 10000,
          spawns: [
            {
              enemy: "aphid",
              count: 1,
              delayMs: 0,
              intervalMs: 0,
              formation: "line",
              xPercent: 0.5
            }
          ]
        }
      ]
    }
  ];
  const stories: readonly StoryEntry[] = [
    {
      id: "great-potato-awakening",
      title: "Test entry",
      body: ["body"],
      logSummary: ["summary"],
      musicTrack: null,
      voiceTrack: "/audio/story/test.mp3",
      voiceDelayMs: 0,
      autoTrigger: { kind: "on-system-enter", systemId: "tutorial" },
      mode: "modal"
    }
  ];

  return {
    enemies,
    weapons,
    augments,
    missions,
    solarSystems,
    lootPools,
    missionWaves,
    stories
  };
}

describe("runDataIntegrityCheck — live data", () => {
  it("passes for the canonical content (smoke test)", () => {
    const data = buildLiveIntegrityData(getAllMissions());
    expect(() => runDataIntegrityCheck(data)).not.toThrow();
  });

  it("passes for the minimal fixture", () => {
    expect(() => runDataIntegrityCheck(fixture())).not.toThrow();
  });
});

describe("runDataIntegrityCheck — waves → enemies", () => {
  it("throws when a wave spawn references an unknown enemy id", () => {
    const data = fixture();
    const broken: IntegrityData = {
      ...data,
      missionWaves: [
        {
          missionId: "tutorial",
          waves: [
            {
              id: "tutorial-1",
              durationMs: 10000,
              spawns: [
                {
                  enemy: "pirate-skifff" as never, // intentional typo
                  count: 1,
                  delayMs: 0,
                  intervalMs: 0,
                  formation: "line",
                  xPercent: 0.5
                }
              ]
            }
          ]
        }
      ]
    };
    expect(() => runDataIntegrityCheck(broken)).toThrow(
      /missionWaves\['tutorial'\]\.waves\['tutorial-1'\]\.spawns\[0\]\.enemy.*unknown enemy 'pirate-skifff'/
    );
  });

  it("includes a 'did you mean' hint when a typo is close to a known id", () => {
    // 'aphidd' is a single-character typo of 'aphid'; the suggester should
    // surface it in the error message.
    const data = fixture();
    const broken: IntegrityData = {
      ...data,
      missionWaves: [
        {
          missionId: "tutorial",
          waves: [
            {
              id: "tutorial-1",
              durationMs: 10000,
              spawns: [
                {
                  enemy: "aphidd" as never,
                  count: 1,
                  delayMs: 0,
                  intervalMs: 0,
                  formation: "line",
                  xPercent: 0.5
                }
              ]
            }
          ]
        }
      ]
    };
    expect(() => runDataIntegrityCheck(broken)).toThrow(/typo of 'aphid'/);
  });
});

describe("runDataIntegrityCheck — missions → systems / requires / orbitParent", () => {
  it("throws when a mission references an unknown solar system", () => {
    const data = fixture();
    const broken: IntegrityData = {
      ...data,
      missions: [
        {
          ...data.missions[0]!,
          solarSystemId: "ghost-system" as never
        }
      ]
    };
    expect(() => runDataIntegrityCheck(broken)).toThrow(
      /missions\['tutorial'\]\.solarSystemId.*unknown solar system 'ghost-system'/
    );
  });

  it("throws when a mission requires another mission that does not exist", () => {
    const data = fixture();
    const broken: IntegrityData = {
      ...data,
      missions: [
        {
          ...data.missions[0]!,
          requires: ["does-not-exist" as never]
        }
      ]
    };
    expect(() => runDataIntegrityCheck(broken)).toThrow(
      /missions\['tutorial'\]\.requires\[0\].*unknown mission 'does-not-exist'/
    );
  });

  it("throws when a mission requires itself", () => {
    const data = fixture();
    const broken: IntegrityData = {
      ...data,
      missions: [
        {
          ...data.missions[0]!,
          requires: ["tutorial"]
        }
      ]
    };
    expect(() => runDataIntegrityCheck(broken)).toThrow(
      /missions\['tutorial'\]\.requires\[0\] is a self-reference/
    );
  });

  it("throws when orbitParentId points to a mission in a different solar system", () => {
    const data = fixture();
    const broken: IntegrityData = {
      ...data,
      solarSystems: [
        ...data.solarSystems,
        {
          id: "tubernovae",
          name: "Tubernovae",
          description: "Test",
          sunColor: "#ff7755",
          sunSize: 1,
          ambientHue: "#2a1014",
          galaxyMusicTrack: "/audio/music/tubernovae-galaxy.ogg"
        }
      ],
      missions: [
        data.missions[0]!,
        {
          ...data.missions[0]!,
          id: "burnt-spud",
          solarSystemId: "tubernovae",
          orbitParentId: "tutorial" // crosses systems — illegal
        }
      ]
    };
    expect(() => runDataIntegrityCheck(broken)).toThrow(
      /missions\['burnt-spud'\]\.orbitParentId.*different solar system/
    );
  });
});

describe("runDataIntegrityCheck — lootPools → systems / weapons / augments", () => {
  it("throws when a loot pool references an unknown weapon", () => {
    const data = fixture();
    const broken: IntegrityData = {
      ...data,
      lootPools: [
        {
          ...data.lootPools[0]!,
          weapons: ["spud-bazooka" as WeaponId]
        }
      ]
    };
    expect(() => runDataIntegrityCheck(broken)).toThrow(
      /lootPools\['tutorial'\]\.weapons\[0\].*unknown weapon 'spud-bazooka'/
    );
  });

  it("throws when a loot pool references an unknown augment", () => {
    const data = fixture();
    const broken: IntegrityData = {
      ...data,
      lootPools: [
        {
          ...data.lootPools[0]!,
          augments: ["super-power" as AugmentId]
        }
      ]
    };
    expect(() => runDataIntegrityCheck(broken)).toThrow(
      /lootPools\['tutorial'\]\.augments\[0\].*unknown augment 'super-power'/
    );
  });

  it("throws when a loot pool's systemId is unknown", () => {
    const data = fixture();
    const broken: IntegrityData = {
      ...data,
      lootPools: [
        {
          ...data.lootPools[0]!,
          systemId: "vanished-system" as never
        }
      ]
    };
    expect(() => runDataIntegrityCheck(broken)).toThrow(
      /lootPools\['vanished-system'\]\.systemId.*unknown solar system 'vanished-system'/
    );
  });
});

describe("runDataIntegrityCheck — story → missions / systems", () => {
  it("throws when an on-mission-select trigger points at an unknown mission", () => {
    const data = fixture();
    const broken: IntegrityData = {
      ...data,
      stories: [
        {
          ...data.stories[0]!,
          autoTrigger: {
            kind: "on-mission-select",
            missionId: "ghost-mission" as never
          }
        }
      ]
    };
    expect(() => runDataIntegrityCheck(broken)).toThrow(
      /story\['great-potato-awakening'\]\.autoTrigger\.missionId.*unknown mission 'ghost-mission'/
    );
  });

  it("throws when an on-system-cleared-idle trigger points at an unknown system", () => {
    const data = fixture();
    const broken: IntegrityData = {
      ...data,
      stories: [
        {
          ...data.stories[0]!,
          autoTrigger: {
            kind: "on-system-cleared-idle",
            systemId: "void" as never,
            initialDelayMs: 1000,
            intervalMs: 1000
          }
        }
      ]
    };
    expect(() => runDataIntegrityCheck(broken)).toThrow(
      /story\['great-potato-awakening'\]\.autoTrigger\.systemId.*unknown solar system 'void'/
    );
  });

  it("does not throw on first-time / on-shop-open triggers (no cross-ref to validate)", () => {
    const data = fixture();
    const ok: IntegrityData = {
      ...data,
      stories: [
        {
          ...data.stories[0]!,
          autoTrigger: { kind: "first-time" }
        },
        {
          ...data.stories[0]!,
          id: "market-arrival",
          autoTrigger: { kind: "on-shop-open" }
        }
      ]
    };
    expect(() => runDataIntegrityCheck(ok)).not.toThrow();
  });
});

describe("runDataIntegrityCheck — waves → missions", () => {
  it("throws when a missionWaves entry targets an unknown mission id", () => {
    const data = fixture();
    const broken: IntegrityData = {
      ...data,
      missionWaves: [
        {
          ...data.missionWaves[0]!,
          missionId: "phantom-mission" as never
        }
      ]
    };
    expect(() => runDataIntegrityCheck(broken)).toThrow(
      /missionWaves\[0\]\.missionId.*unknown mission 'phantom-mission'/
    );
  });
});
