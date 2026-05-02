import { describe, expect, it } from "vitest";

// Boot-time schema validation, run once per `npm test` instead of at module
// load. Each accessor module under src/game/data/* used to call
// `Schema.parse(jsonData)` at the top of its file — that pulled Zod (~98 kB)
// into the client bundle of every route that touches game state, since
// MenuMusic / useGameState / getSolarSystem etc. transitively import those
// accessors.
//
// Moving the parse here preserves the safety guarantee (CI gates merges, so
// a drifted JSON edit still fails before reaching users) while letting the
// production bundle skip Zod entirely. The 5 data files just trust the JSON
// shape now via a single `as` cast — the contract is that the cast is sound
// IFF this test passes.
//
// Add a new accessor? Add a `it("<name>.json matches its schema", ...)`
// block here. The test file is intentionally flat — one assertion per JSON,
// no shared helpers — so a failure points unambiguously at the offending
// file.

import enemiesData from "../enemies.json";
import missionsData from "../missions.json";
import solarSystemsData from "../solarSystems.json";
import wavesData from "../waves.json";
import weaponsData from "../weapons.json";
import { EnemiesFileSchema } from "@/lib/schemas/enemies";
import { MissionsFileSchema } from "@/lib/schemas/missions";
import { SolarSystemsFileSchema } from "@/lib/schemas/solarSystems";
import { WavesFileSchema } from "@/lib/schemas/waves";
import { WeaponsFileSchema } from "@/lib/schemas/weapons";

describe("game-data JSON ↔ Zod schema validation (CI drift gate)", () => {
  it("enemies.json matches EnemiesFileSchema", () => {
    expect(() => EnemiesFileSchema.parse(enemiesData)).not.toThrow();
  });

  it("missions.json matches MissionsFileSchema", () => {
    expect(() => MissionsFileSchema.parse(missionsData)).not.toThrow();
  });

  it("solarSystems.json matches SolarSystemsFileSchema", () => {
    expect(() => SolarSystemsFileSchema.parse(solarSystemsData)).not.toThrow();
  });

  it("waves.json matches WavesFileSchema", () => {
    expect(() => WavesFileSchema.parse(wavesData)).not.toThrow();
  });

  it("weapons.json matches WeaponsFileSchema", () => {
    expect(() => WeaponsFileSchema.parse(weaponsData)).not.toThrow();
  });
});
