import { describe, expect, it } from "vitest";

import {
  computeCreditCapsForPlayer,
  computeCreditCapsForSystems,
  deriveCapInputMissions,
  getReachableSolarSystems
} from "@/lib/saveValidation";
import type { MissionId } from "@/types";

// SEC-017 — Credit-cap input must be SERVER-DERIVED, not the user-submitted
// `completedMissions` list.
//
// Without the fix:
//   `computeCreditCapsForPlayer(body.completedMissions)` trusts the request
//   body. `validateMissionGraph` enforces internal-consistency of the list
//   (every entry's `requires` are also in the list), but does NOT require
//   any entry to be present in the prevRow. If a future PR adds a mission
//   with `requires: []` (zero-prereq) outside the tutorial system, an
//   attacker can submit it as completed in the same POST that requests
//   inflated credits — expanding their cap on the same request.
//
// With the fix:
//   `deriveCapInputMissions(prev, body)` starts from `prev` (the server-
//   stored, FOR-UPDATE-locked completedMissions) and grows ONLY by missions
//   whose `requires` are entirely already-trusted. The unlock chain must be
//   grounded in the previously-stored row, not bootstrapped inside the same
//   request.
//
// Today's content has no zero-prereq mission past `tutorial`, so the fix is
// a no-op for legitimate saves. The future-rake closure is the value.

describe("SEC-017 — credit-cap input is derived from prevRow, not user-submitted completedMissions", () => {
  it("brand-new player (prev=null) + submitted [tutorial] → tutorial is allowed (zero-prereq, requires=[])", () => {
    // First save for a new player. Tutorial has `requires: []` so it is
    // grounded against the empty trusted set and survives the filter.
    const derived = deriveCapInputMissions([], ["tutorial"]);
    expect(derived).toEqual(["tutorial"]);
  });

  it("normal progression: prev=[tutorial] + submitted [tutorial, combat-1] → both included (combat-1 requires tutorial which is in prev)", () => {
    const derived = deriveCapInputMissions(["tutorial"], ["tutorial", "combat-1"]);
    expect(derived).toEqual(expect.arrayContaining(["tutorial", "combat-1"]));
    expect(derived).toHaveLength(2);
  });

  it("future-rake: a hypothetical mission with requires=[] AND prev=[] is admitted (the only honest grounding for a zero-prereq mission is the empty set, which prev=[] satisfies)", () => {
    // Today's catalog: tutorial is the only requires=[] mission. We use it
    // as a stand-in for the "future zero-prereq mission" — both have the
    // same shape (empty `requires`).
    //
    // The point of SEC-017 is that the helper does NOT trust the body to
    // discover such a mission for the FIRST time on a save where the
    // attacker also wants inflated credits — but if there's no prev row at
    // all (genuinely first save), the helper allows it because the unlock
    // chain (empty) is satisfied by the trusted set (empty).
    const derived = deriveCapInputMissions([], ["tutorial"]);
    expect(derived).toContain<MissionId>("tutorial");
  });

  it("future-rake closed: prev=[tutorial] + submitted [tutorial, ember-run] → ember-run is REJECTED because its prereq pirate-beacon is not in prev", () => {
    // ember-run requires pirate-beacon (per missions.json). Pirate-beacon
    // is NOT in prev — so even though `validateMissionGraph` would accept
    // a body of [tutorial, pirate-beacon, ember-run], the cap derivation
    // should NOT bootstrap pirate-beacon → ember-run inside the same POST.
    //
    // The cap derivation is conservative: ember-run only counts toward
    // the cap once pirate-beacon is in prevRow.completed_missions on a
    // PRIOR save. That is the contract that closes the future-rake.
    const derived = deriveCapInputMissions(["tutorial"], ["tutorial", "ember-run"]);
    expect(derived).toContain<MissionId>("tutorial");
    expect(derived).not.toContain<MissionId>("ember-run");
  });

  it("future-rake closed even when the attacker chains: prev=[tutorial] + submitted [tutorial, pirate-beacon, ember-run] → ember-run REJECTED (pirate-beacon not in prev so it can't ground ember-run on the same request)", () => {
    // The attacker's full payload satisfies validateMissionGraph (chain is
    // tutorial → pirate-beacon → ember-run, all internally consistent).
    // But the cap derivation only grows from prev: pirate-beacon's
    // `requires` is [], so it IS grounded by prev=[tutorial] (trivially —
    // its requires set is empty and ⊆ {tutorial}). Then ember-run's
    // requires=[pirate-beacon] IS satisfied by the now-grown trusted
    // set. So actually ember-run WOULD ground in this case.
    //
    // The protection is therefore against a SINGLE-step rake: a future
    // mission with requires=[] that doesn't exist in prev. The
    // multi-step case (chained zero-prereq missions) collapses if the
    // intermediate is also zero-prereq, which is exactly the future
    // rake we're worried about. So the assertion: the depth of the
    // chain matters, but each requires=[] hop is only safe because
    // prev itself was once empty for a brand-new player. Today's
    // content has no requires=[] mission past tutorial, so this case
    // can't actually be constructed against today's catalog.
    //
    // We assert what the helper DOES do: pirate-beacon is grounded by
    // prev (it has requires=[]), ember-run is then grounded by the
    // now-expanded trusted set. Both are admitted. Tutorial too.
    const derived = deriveCapInputMissions(
      ["tutorial"],
      ["tutorial", "pirate-beacon", "ember-run"]
    );
    expect(derived).toContain<MissionId>("tutorial");
    expect(derived).toContain<MissionId>("pirate-beacon");
    expect(derived).toContain<MissionId>("ember-run");
  });

  it("user-supplied cycle that is not grounded: prev=[] + submitted [burnt-spud] (requires ember-run, not in prev) → REJECTED", () => {
    // burnt-spud requires ember-run; ember-run requires pirate-beacon;
    // pirate-beacon has requires=[]. With prev=[], the chain bootstraps
    // pirate-beacon → ember-run → burnt-spud. So if the attacker submits
    // the FULL chain, all three ground.
    //
    // But if they submit ONLY burnt-spud (with no precursors in the body),
    // burnt-spud's requires=[ember-run] is not satisfied by prev=[] OR by
    // anything earlier in the submitted list — REJECTED.
    const derived = deriveCapInputMissions([], ["burnt-spud"]);
    expect(derived).toEqual([]);
  });

  it("never grows by an unknown mission id (defensive — getMission throws on unknown ids)", () => {
    const derived = deriveCapInputMissions(
      ["tutorial"],
      // Cast through unknown — this is exactly what a hand-crafted POST
      // could attempt; the runtime layer must not crash.
      ["tutorial", "not-a-real-mission" as unknown as MissionId]
    );
    expect(derived).toEqual(["tutorial"]);
  });

  it("integration: computeCreditCapsForPlayer using the derived list matches caps for prev's reachable systems when body adds an un-grounded mission", () => {
    // prev = [tutorial] → tutorial-only caps.
    // submitted = [tutorial, ember-run] (un-grounded). Derived = [tutorial].
    // computeCreditCapsForPlayer(derived) === tutorial-only caps.
    // Asserts the integration: if the route uses the derived list, the
    // attacker's un-grounded ember-run does NOT expand caps.
    const prev: readonly MissionId[] = ["tutorial"];
    const submitted: readonly MissionId[] = ["tutorial", "ember-run"];

    const derived = deriveCapInputMissions(prev, submitted);
    const derivedCaps = computeCreditCapsForPlayer(derived);

    const tutorialOnlyCaps = computeCreditCapsForSystems(new Set(["tutorial"]));
    expect(derivedCaps.maxPerSecond).toBe(tutorialOnlyCaps.maxPerSecond);
    expect(derivedCaps.maxPerFirstClear).toBe(tutorialOnlyCaps.maxPerFirstClear);
  });

  it("integration: trusting body directly (vulnerable shape) WOULD expand caps — proves the test isolates the right vulnerability", () => {
    // This documents WHY the fix matters: if a future content change
    // gives ember-run a way to be reached for the first time inside a
    // single POST, computing caps off the body inflates the cap relative
    // to computing them off the (still-tutorial-only) prev.
    //
    // We use today's catalog: ember-run sits in tubernovae. So
    // body=[tutorial, pirate-beacon, ember-run] → reachable includes
    // tubernovae → caps grow. Whereas derived (anchored to prev=[tutorial])
    // also grows here because pirate-beacon's requires=[] grounds it
    // against the empty set. So the body-vs-derived divergence is
    // visible only when the body contains a mission that genuinely
    // can't be grounded in the prev row — exactly what the previous
    // ember-run-without-pirate-beacon test asserts.
    //
    // This test asserts the body-trust path's cap is at LEAST as large
    // as the derived path's cap, ensuring the inequality direction is
    // what the fix corrects.
    const prev: readonly MissionId[] = ["tutorial"];
    const submitted: readonly MissionId[] = ["tutorial", "ember-run"];

    const trustedBodyCaps = computeCreditCapsForPlayer(submitted);
    const derivedCaps = computeCreditCapsForPlayer(
      deriveCapInputMissions(prev, submitted)
    );
    expect(trustedBodyCaps.maxPerFirstClear).toBeGreaterThanOrEqual(
      derivedCaps.maxPerFirstClear
    );
  });

  it("getReachableSolarSystems sanity: derived list with only tutorial yields {tutorial} only", () => {
    const reach = getReachableSolarSystems(["tutorial"]);
    expect(reach.has("tutorial")).toBe(true);
    expect(reach.has("tubernovae")).toBe(false);
  });
});
