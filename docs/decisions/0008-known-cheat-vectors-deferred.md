# ADR 0008: Known cheat vectors — accepting the trade today, balance audit later

Date: 2026-05-05
Status: accepted

## Context

PR #159 changed the sell flow from `weapon.cost * 0.5` to a 100% refund of
the player's full investment (base cost + every upgrade step paid + every
installed augment). The motivator was player-friendly UX: a Mark-3 Potato
Cannon (free starter, base cost = 0) was unsellable under the old rule
because `floor(0 * 0.5) = 0`, even though the player had spent ¢600 on
upgrades. With 100% refund, that ¢600 comes back when the starter is
swapped out — which is what a player intuitively expects.

The trade-off: items the player received **for free** can now be sold for
their full catalog cost. Two paths in particular:

- `grantWeapon(id)` — a mission reward / mid-mission pickup that hands
  over a fresh level-1 instance. Pre-PR-#159 it could be sold for half
  the catalog cost; post-PR-#159, full catalog cost. A free Spread Shot
  (¢450) becomes a ¢450 credit conversion.
- `grantAugment(id)` — same shape for augments. A free Damage Booster
  augment dropped mid-mission can be immediately sold from
  `augmentInventory` for the full augment cost via `sellAugment`.

Buy/sell churn on **purchased** items is still a wash (refund equals
spend, no net gain). The exposure is exclusively on items that bypassed
the credit ledger via `grant*` mutators.

## Decision

We accept this cheat vector for now. The trade-off is deliberate:

- **Player-experience priority.** The pre-#159 sell rules trapped the
  player's upgrade investment in starter weapons. The fix is the right
  call for player flexibility; partial-refund schemes that try to
  distinguish "bought" from "granted" instances would either complicate
  `WeaponInstance` (e.g. an `originallyGranted: boolean` flag that has
  to round-trip through saves) or weaken the refund (e.g. only refund
  upgrade investment, not base cost — re-introducing the "free starter
  unsellable" problem in a different form).
- **Content > balance for the current development phase.** We are still
  filling in core content (missions, weapons, story chapters, voiceover
  passes). A balance audit before content is in place would re-tune the
  same numbers twice. The leaderboard is a local cohort, not a
  competitive surface, so even a player who farms granted-item sells is
  not displacing anyone else.
- **Server-side guards already throttle the worst case.** The
  `validateCreditsDelta` cap in [src/lib/saveValidation.ts](../../src/lib/saveValidation.ts)
  is per-mission-completion + per-second + per-loot-pool, derived from
  the player's progression state. A player who sells every granted item
  in one mission would still bump up against the per-mission cap. The
  cap is observation-first per [ADR 0003](./0003-anti-cheat-observation-not-enforcement.md):
  rejections are 422-and-retry, not bans. If a legitimate player trips
  the cap from this flow, the audit log shows the pattern and we
  re-tune.

## Consequences

- **Known economy hole.** A motivated player can convert grant-pool
  rewards (mission-clear weapons, mid-combat augment drops) into liquid
  credits at full catalog price. Uncapped on the client; capped only by
  the per-mission credit-delta validator.
- **Audit log will catch egregious cases.** `spacepotatis.save_audit`
  rows show the credit delta per save. A player consistently bumping up
  against the cap from this flow becomes visible there.
- **Future balance audit MUST revisit.** The trade-off is provisional —
  acceptable while content is the bottleneck. Once we ship the next
  solar system / mission set, the balance audit (TODO.md "Phase Balance
  Audit") tunes sell rates / introduces granted-item flags / both.

## Open questions for the balance audit

- Track `originallyGranted` on `WeaponInstance` and `AugmentInventoryEntry`?
- Lower `SELL_RATE` to e.g. 0.75 for grants only?
- Or accept the trade indefinitely if leaderboard never becomes
  competitive — at which point this is just a player flexibility win
  with no real cost?

These get answered after the content backlog clears, not now.
