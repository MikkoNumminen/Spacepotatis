import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLoadSaveCache, setCurrentPlayerEmail } from "@/game/state/syncCache";
import { installFakeLocalStorage } from "@/__tests__/fakeStorage";
import { clearSaveQueue } from "@/game/state/saveQueue";

// SEC-025 — Full raw save-row JSON dumped to browser console on parse failure.
//
// Without the fix:
//   console.error("loadSave: schema rejected save row\nissues:", ...,
//                 "\nraw:", JSON.stringify(raw, null, 2))
//   dumps the full server response — credits, ship config, mission list —
//   to the browser console. Anyone with DevTools open sees the player's state.
//
// With the fix:
//   Only the Zod issues array is logged; the raw payload (or any
//   serialization of it containing PII fields like `credits`, `shipConfig`,
//   `completedMissions`) is NOT passed to console.error.

const TEST_EMAIL = "tester@example.com";

// Fake RemoteSaveSchema — we want safeParse to fail so the parse-failure
// branch in sync.ts fires. The actual Zod schema is dynamically imported
// inside loadSave, so we mock the whole module.
vi.mock("@/lib/schemas/save", async () => {
  const actual = await vi.importActual<typeof import("@/lib/schemas/save")>("@/lib/schemas/save");
  return {
    ...actual,
    RemoteSaveSchema: {
      safeParse: (_raw: unknown) => ({
        success: false,
        error: {
          issues: [
            { code: "custom", path: ["credits"], message: "Expected number, got string" }
          ]
        }
      })
    }
  };
});

// Minimal valid-looking JSON that would be the raw server response.
// The test asserts NONE of these recognizable values appear in any
// console.error argument as a stringified dump.
const FAKE_RAW_PAYLOAD = {
  slot: 1,
  credits: 99999,
  currentPlanet: null,
  shipConfig: {
    slots: [{ id: "rapid-fire", level: 3, augments: [] }],
    inventory: [],
    augmentInventory: [],
    shieldLevel: 0,
    armorLevel: 0,
    reactor: { capacityLevel: 0, rechargeLevel: 0 }
  },
  completedMissions: ["tutorial", "combat-1"],
  unlockedPlanets: ["tutorial", "combat-1"],
  playedTimeSeconds: 1234,
  updatedAt: "2025-01-01T00:00:00.000Z"
};

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  installFakeLocalStorage();
  clearSaveQueue();
  clearLoadSaveCache();
  setCurrentPlayerEmail(TEST_EMAIL);

  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  vi.stubGlobal("fetch", (_input: unknown, _init?: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(FAKE_RAW_PAYLOAD), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("SEC-025 — loadSave parse-failure branch does not log raw save-row payload", () => {
  it("console.error is called — parse failure IS reported to the operator", async () => {
    const { loadSave } = await import("@/game/state/sync");
    await loadSave();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("does NOT pass the raw payload JSON string (credits / shipConfig / completedMissions) to console.error", async () => {
    const { loadSave } = await import("@/game/state/sync");
    await loadSave();
    const combined = (errorSpy.mock.calls as unknown[][])
      .flatMap((call: unknown[]) => call)
      .map((arg: unknown) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join(" ");
    // PII field values from the raw payload must not appear in the log.
    expect(combined).not.toContain('"credits":99999');
    expect(combined).not.toContain('"rapid-fire"');
    expect(combined).not.toContain('"combat-1"');
    expect(combined).not.toContain('"playedTimeSeconds":1234');
  });

  it("does NOT pass the raw object reference as a console.error argument", async () => {
    const { loadSave } = await import("@/game/state/sync");
    await loadSave();
    const allArgs = (errorSpy.mock.calls as unknown[][]).flatMap((call: unknown[]) => call);
    const hasRawObject = allArgs.some(
      (arg: unknown) =>
        arg !== null &&
        typeof arg === "object" &&
        (arg as Record<string, unknown>)["credits"] === 99999
    );
    expect(hasRawObject).toBe(false);
  });

  it("still logs the Zod issues array so the operator can diagnose the rejection", async () => {
    const { loadSave } = await import("@/game/state/sync");
    await loadSave();
    const combined = (errorSpy.mock.calls as unknown[][])
      .flatMap((call: unknown[]) => call)
      .map((arg: unknown) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join(" ");
    // The mock issues message must appear in the logged output.
    expect(combined).toMatch(/Expected number, got string|schema rejected|issues/i);
  });

  it("returns kind=load-failed with reason=schema_rejected after parse failure", async () => {
    const { loadSave } = await import("@/game/state/sync");
    const result = await loadSave();
    expect(result.kind).toBe("load-failed");
    expect(result.reason).toBe("schema_rejected");
  });
});
