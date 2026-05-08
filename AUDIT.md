# Spacepotatis production audit — 2026-05-08

Auditor: senior full-stack pass over auth, data loading, and views.
Stack reminder: Next.js 15 App Router, Edge runtime API routes, Neon serverless,
NextAuth v5 JWT, Vercel Hobby tier.

---

## Phase 1 inventory

### Routes

| Path | Type | Auth | Notes |
|---|---|---|---|
| `/` | static (`force-static`) | none | Landing. Client islands hydrate auth. |
| `/play` | static (`force-static`) | none | Game shell; Phaser + Three loaded via `next/dynamic({ssr:false})`. |
| `/shop` | static (`force-static`) | none | Shop shell; client gated by `ShopShell` boot splash. |
| `/leaderboard` | ISR (`revalidate: 60`) | none | Server Component fan-out: `<TopPilots>` + N × `<Leaderboard>`. |
| `/api/auth/[...nextauth]` | edge ⨯ no — Node | n/a | NextAuth v5 handlers, Node runtime (Google OAuth). |
| `/api/save` GET/POST | edge | required | Save game state. POST has FOR UPDATE tx + 4-validator chain + audit. |
| `/api/handle` GET/POST | edge | required | Player handle CRUD. POST has unique-violation handling. |
| `/api/leaderboard` GET | edge | none (public) | Reads via `unstable_cache(60s)`. |
| `/api/leaderboard` POST | edge | required | Score submission with mission-completion + per-mission cap guards. |

### Pages without `loading.tsx` / `error.tsx`

| Path | loading.tsx | error.tsx |
|---|---|---|
| `/` | ✗ | ✗ |
| `/play` | ✗ (GameCanvas owns its own splash) | ✗ |
| `/shop` | ✗ (ShopShell owns its own gate) | ✗ |
| `/leaderboard` | ✓ | ✓ |

### API inventory

| Route | Method | Validates with | DB ops | Retries |
|---|---|---|---|---|
| `/api/save` | GET | — | `upsertPlayerId` + 1 SELECT | ✓ |
| `/api/save` | POST | `SavePayloadSchema` | `upsertPlayerId` + 1 tx (SELECT FOR UPDATE + INSERT/UPDATE) + 1 audit INSERT | ✓ |
| `/api/handle` | GET | — | `upsertPlayerId` + 1 SELECT | ✗ |
| `/api/handle` | POST | `HandlePayloadSchema` | `upsertPlayerId` + 1 SELECT + 1 UPDATE | ✗ |
| `/api/leaderboard` | GET | `MissionIdSchema` | `getCachedLeaderboard` (cached) | ✓ (via wrapper) |
| `/api/leaderboard` | POST | `ScorePayloadSchema` + per-mission cap | `upsertPlayerId` + 1 SELECT + 1 INSERT + `revalidateTag` | ✗ |

### Database

| Table | PK | Indexes | FK + cascade |
|---|---|---|---|
| `players` | `id uuid` | unique `email`, partial unique `LOWER(handle) WHERE handle IS NOT NULL` | — |
| `save_games` | `id uuid` | unique `(player_id, slot)` | `player_id → players.id ON DELETE CASCADE` |
| `leaderboard` | `id uuid` | composite `(mission_id, score DESC, created_at DESC)` | `player_id → players.id ON DELETE CASCADE` |
| `save_audit` | `id bigserial` | `(player_id, created_at DESC)` | `player_id → players.id ON DELETE CASCADE` |

---

## Phase 2 findings

### 🔴 Critical

**None.** The auth/data layers are solid: every mutating API route checks
`session?.user?.email`, every private query is scoped to `player_id` derived
from the session email (never from the request body), the save POST runs a
single FOR UPDATE transaction with a 4-validator cheat-guard chain
(`validateMissionGraph` → `validateNoRegression` → `validatePlaytimeDelta` →
`validateCreditsDelta`) plus the SEC-027 solar-system unlock check, and
PR #207 just landed Neon retry on the highest-flake-risk paths.

The audit looked specifically for: auth bypass, IDOR, data leaks across
players, missing input validation, schema violations, missing FK
constraints, and broken views. None found.

### 🟡 Important

**A1. `/api/leaderboard` POST + `/api/handle` GET/POST do not retry transient Neon flakes.**
- File: [src/app/api/leaderboard/route.ts:67-104](src/app/api/leaderboard/route.ts#L67-L104), [src/app/api/handle/route.ts:25-107](src/app/api/handle/route.ts#L25-L107)
- What's wrong: PR #207 added `withNeonRetry` to `/api/save` (POST + GET) and
  the `/leaderboard` server component, but the same control-plane flake
  symptom can hit `/api/leaderboard` POST and `/api/handle` GET/POST. A user
  setting their handle or submitting a score during a cold-instance window
  gets a 500.
- Fix: wrap `upsertPlayerId` and the DB chain in `withNeonRetry` with
  appropriate labels, mirroring the `/api/save` pattern.

**A2. `/play` and `/shop` have no error boundaries.**
- Files: [src/app/play/](src/app/play/), [src/app/shop/](src/app/shop/)
- What's wrong: if `next/dynamic` fails to load the GameCanvas chunk
  (network issue, cache miss after deploy), or if `ShopShell`'s cloud-save
  load throws, the user sees Next.js's generic root error UI rather than a
  branded recovery affordance. `/leaderboard` has a tailored error boundary —
  the other two should too.
- Fix: add `error.tsx` to both segments. Re-use the same shape as
  [src/app/leaderboard/error.tsx](src/app/leaderboard/error.tsx).

**A3. Modal components missing `role="dialog"` + `aria-modal="true"`.**
- Files (9 total):
  [src/components/loadout/WeaponDetailsModal.tsx:53](src/components/loadout/WeaponDetailsModal.tsx#L53),
  [src/components/loadout/AugmentDetailsModal.tsx](src/components/loadout/AugmentDetailsModal.tsx),
  [src/components/loadout/UpgradeDetailsModal.tsx](src/components/loadout/UpgradeDetailsModal.tsx),
  [src/components/loadout/StatDetailsModal.tsx](src/components/loadout/StatDetailsModal.tsx),
  [src/components/loadout/AugmentPicker.tsx:41](src/components/loadout/AugmentPicker.tsx#L41),
  [src/components/loadout/SlotPicker.tsx:29](src/components/loadout/SlotPicker.tsx#L29),
  [src/components/story/StoryModal.tsx:76](src/components/story/StoryModal.tsx#L76),
  [src/components/story/StoryListModal.tsx:32](src/components/story/StoryListModal.tsx#L32),
  [src/components/galaxy/VictoryModal.tsx:94](src/components/galaxy/VictoryModal.tsx#L94)
- What's wrong: screen readers don't announce these as modal dialogs,
  breaking the focus / context expectation for keyboard + assistive-tech
  users.
- Fix: add `role="dialog" aria-modal="true"` to the inner panel div on each.
  Optionally add `aria-labelledby="<title-id>"` and an `id` on the title.

### 🟢 Polish

**P1. `PlayButton` is an `<a>` tag with `preventDefault`.**
- File: [src/components/PlayButton.tsx:102](src/components/PlayButton.tsx#L102)
- Semantic mismatch — semantically a link, functionally a button. Skip per
  user instruction "do not refactor or restructure code".

**P2. No index on `leaderboard.player_id`.**
- The `getCachedTopPilots` query does a `LEFT JOIN spacepotatis.leaderboard
  GROUP BY player_id`. At current scale (small playerbase) this is a hash agg
  over a few thousand rows — fast. At 100k+ scores it would benefit from
  `CREATE INDEX leaderboard_player_idx ON spacepotatis.leaderboard(player_id)`.
  Not actionable today; flag for the next migration window.

**P3. `/api/handle` GET reads the DB on every call.**
- The handle changes very rarely; could be cached client-side (already done
  via `useHandle`) but the server route hits Neon each request. Hobby-tier
  invocation count, not CPU, is the bottleneck — minor.

**P4. Modals lack focus-trap + autofocus.**
- Same 9 files as A3. Keyboard users tab "out" of the modal into the
  underlying page. Out of scope for "no refactor" fix; add focus-trap
  library in a future polish PR.

**P5. JWT session uses NextAuth default `maxAge` (30 days).**
- File: [src/lib/auth.ts:32](src/lib/auth.ts#L32)
- Reasonable for a casual game; explicit setting would document the
  decision. Pin via `session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 }`
  in a future hardening PR.

**P6. `upsertPlayerId` runs on every API call.**
- An ON CONFLICT round-trip per request. Could be cached in `token.playerId`
  via the JWT callback for read-heavy paths. Trade-off: invalidation on
  player deletion. Not actionable in this audit pass.

### Non-issues confirmed

- ✅ All API routes that mutate state check `session?.user?.email` before any
  DB call.
- ✅ All private queries scope to `player_id` derived from server session,
  never from request body. No IDOR vector.
- ✅ Public reads (leaderboard) only expose `handle`, `score`, `time_seconds`,
  `created_at` — never `email` or `name`.
- ✅ FK with `ON DELETE CASCADE` on `save_games`, `leaderboard`, and
  `save_audit` — deleting a player cleans up their data.
- ✅ Save POST runs SELECT + validators + UPSERT in ONE Kysely transaction
  with `.forUpdate()` (SEC-013, INV-SAVE-1).
- ✅ Audit table caps payload at 64 KB to foreclose storage-DoS amplifier
  (SEC-011).
- ✅ Mission ID validated against the union of known IDs (`MissionIdSchema`)
  before any cache key or query — no key-injection vector.
- ✅ `trustHost: true` is documented at [src/lib/auth.ts:13-24](src/lib/auth.ts#L13-L24)
  with the upstream Vercel + Google OAuth allow-list defenses (SEC-012).
- ✅ Email verification check (SEC-019) on `signIn` callback rejects unverified
  OAuth profiles.
- ✅ Security headers: CSP, X-Frame-Options DENY, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy. CSP allows Google OAuth domains;
  `'unsafe-inline'` documented as a future hardening item (SEC-001).
- ✅ No `next/image` usage; all game assets use Phaser/Three texture loading
  per CLAUDE.md §13. No quota waste.
- ✅ No middleware — saves Vercel CPU on static asset paths per CLAUDE.md §13.
- ✅ `force-static` on `/`, `/play`, `/shop`; `revalidate: 60` on
  `/leaderboard`. No accidentally-dynamic page found.
- ✅ All Zod schemas at API boundaries; no `as` casts at the network edge.
- ✅ Build passes typecheck + lint + 1331 tests.

---

## Phase 3 plan

Fix order (all 🟡 — there are no 🔴):
1. **A1** — wrap `/api/leaderboard` POST and `/api/handle` GET/POST in
   `withNeonRetry`. Symmetric with the `/api/save` pattern from PR #207.
2. **A2** — add `error.tsx` to `/play` and `/shop`, modeled on
   `/leaderboard/error.tsx`.
3. **A3** — add `role="dialog" aria-modal="true"` to 9 modal components.

🟢 polish items deferred to a separate PR — not "correctness or reliability"
issues.
