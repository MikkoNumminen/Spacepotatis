# Phase 1 — Attack-surface map

## Scope and method

Read-only walk of the Spacepotatis codebase at master @ `a09984f`. Excluded: `node_modules/`, `.next/`, `out/`, `dist/`, `db-backups/`, `.claude/worktrees/`, `.git/`. Walked in scope: `src/` (all sub-trees), `db/migrations/`, `scripts/`, `public/` (file-listing only), `.github/workflows/`, root configs (`next.config.mjs`, `eslint.config.mjs`, `vercel.json`, `package.json`, `tsconfig.json`, `dbmate.toml`, `.env.example`, `.gitignore`).

Commands run (all read-only): `git log -p --all -S <pattern>` for known secret strings (`AUTH_SECRET`, `DATABASE_URL`, `AUTH_GOOGLE_SECRET`, `BEGIN PRIVATE KEY`, `GOCSPX-`, `AKIA`, `ghp_`, `neondb_owner`, `postgres://`); `git ls-files` filtered for env / secret / credential / token / key / password names; `npm audit --json`; `du -sh public/`; `find public/ -size +500k`; multiple `grep` passes for `dangerouslySetInnerHTML`, `innerHTML`, `eval(`, `postMessage`, `as MissionId`, `as SavePayload`, `await req.json() as`, `process.env.`, `sql\``, `Kysely<any>`, `sql.lit`, `Access-Control-Allow`, `Content-Security-Policy`, `rate.?limit`, `redirect(`, `router.push`, etc.

Inventory tracked: 4 HTTP API route files (auth, save, leaderboard, handle), 5 SQL migration files, 7 player-touching scripts, 4 Next.js page routes (none server-rendered with per-request server logic), 3 Edge runtimes + 1 Node runtime, ~553 npm dependencies (34 prod / 485 dev / 86 optional / 0 peer per `npm audit`).

## CRITICAL FINDINGS — IMMEDIATE

None. No anonymous-internet RCE, no live secret committed, no mass-data-exposure path, no account-takeover vector. The most exposed surface (the unauthenticated `GET /api/leaderboard`) returns only public handles + scores and clamps `limit` server-side. All save / score / handle mutations require an authenticated session.

## 1. Trust boundaries

### HTTP API routes (the only server entry points)

| Path | Method | Runtime | Auth required | Input | Output | Auth-check loc | Validation |
|---|---|---|---|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | nodejs | no (entry) | OAuth callbacks, sign-in, sign-out, session probes | NextAuth standard | NextAuth-internal | NextAuth/`@auth/core` validates state + PKCE |
| `/api/save` | GET | edge | YES | (none — auth cookie only) | save row JSON or null | [src/app/api/save/route.ts:22-24](../../src/app/api/save/route.ts#L22-L24) | n/a |
| `/api/save` | POST | edge | YES | JSON `SavePayload` | 204, 400, 401, 422, 500 | [src/app/api/save/route.ts:112-115](../../src/app/api/save/route.ts#L112-L115) | `SavePayloadSchema.safeParse` ([src/app/api/save/route.ts:136](../../src/app/api/save/route.ts#L136)) + `validateMissionGraph` + `validateNoRegression` + `validatePlaytimeDelta` + `validateCreditsDelta` ([src/lib/saveValidation.ts](../../src/lib/saveValidation.ts)) |
| `/api/leaderboard` | GET | edge | **NO** (public) | `?mission=<id>&limit=<int>` | `{missionId, entries: [{playerName, score, timeSeconds, createdAt}]}` | n/a — public read | mission param: type-cast only ([src/app/api/leaderboard/route.ts:27](../../src/app/api/leaderboard/route.ts#L27)). limit clamped 1..50 ([src/app/api/leaderboard/route.ts:21](../../src/app/api/leaderboard/route.ts#L21)) |
| `/api/leaderboard` | POST | edge | YES | JSON `ScorePayload` | 201, 400, 401, 422, 500 | [src/app/api/leaderboard/route.ts:37-40](../../src/app/api/leaderboard/route.ts#L37-L40) | `ScorePayloadSchema.safeParse` ([src/app/api/leaderboard/route.ts:49](../../src/app/api/leaderboard/route.ts#L49)) + mission-completion check ([src/app/api/leaderboard/route.ts:66-86](../../src/app/api/leaderboard/route.ts#L66-L86)) |
| `/api/handle` | GET | edge | YES | (none — auth cookie only) | `{handle: string \| null}` | [src/app/api/handle/route.ts:26-29](../../src/app/api/handle/route.ts#L26-L29) | n/a |
| `/api/handle` | POST | edge | YES | JSON `{handle: string}` | `{handle}`, 400, 401, 409, 500 | [src/app/api/handle/route.ts:48-51](../../src/app/api/handle/route.ts#L48-L51) | `HandlePayloadSchema.safeParse` ([src/app/api/handle/route.ts:60](../../src/app/api/handle/route.ts#L60)) |

There is **no `src/middleware.ts`** ([Glob result confirms](../../) — none at root or under `src/`). `vercel.json` has only `ignoreCommand`, no edge config or `crons`.

### Static page routes

| Path | Mode | Runtime | Notes |
|---|---|---|---|
| `/` | force-static | n/a | [src/app/page.tsx:14](../../src/app/page.tsx#L14) |
| `/play` | force-static | n/a | [src/app/play/page.tsx:9](../../src/app/play/page.tsx#L9). `GameCanvas` dynamic-imported `ssr:false` |
| `/shop` | force-static | n/a | [src/app/shop/page.tsx:9](../../src/app/shop/page.tsx#L9) |
| `/leaderboard` | ISR (revalidate=60) | server | [src/app/leaderboard/page.tsx:11](../../src/app/leaderboard/page.tsx#L11). Uses `getCachedLeaderboard` with `unstable_cache` revalidate=60 ([src/lib/leaderboard.ts:57-61](../../src/lib/leaderboard.ts#L57-L61)) |
| `/opengraph-image`, `/twitter-image`, `/apple-icon` | force-static | n/a | [src/app/opengraph-image.tsx:7](../../src/app/opengraph-image.tsx#L7), [src/app/apple-icon.tsx:6](../../src/app/apple-icon.tsx#L6). Pre-baked at build, no per-request invocation |

### CLI / scripts (operator-only entry points)

All under [scripts/](../../scripts/). None expose a server-side route. They read `DATABASE_URL_UNPOOLED` / `DATABASE_URL` from the environment at module load and bail (`process.exit(1)` or `2`) if absent.

| Script | Mutates DB | Default mode | Gate |
|---|---|---|---|
| [scripts/migrate.mjs](../../scripts/migrate.mjs) | YES (DDL) | applies pending migrations | idempotent — `public.spacepotatis_schema_migrations` tracker |
| [scripts/check-schema.mjs](../../scripts/check-schema.mjs) | no | read-only | n/a |
| [scripts/check-player.mjs](../../scripts/check-player.mjs) | no | read-only | n/a |
| [scripts/check-audit-readiness.mjs](../../scripts/check-audit-readiness.mjs) | no | read-only | n/a |
| [scripts/restore-player.mjs](../../scripts/restore-player.mjs) | YES | DRY-RUN by default | requires `--apply --player-email=<X>` matching positional `<email>`; FOR UPDATE row-lock; `writeBackup()` before UPDATE; refuses list-shrink without `--force-overwrite-i-know-this-destroys-progress`; interactive `[y/N]` prompt unless `--no-prompt --i-have-printed-the-before-state` |
| [scripts/improve-restore.mjs](../../scripts/improve-restore.mjs) | YES | **runs immediately on invocation** (no dry-run) | `writeBackup()` before UPDATE ([scripts/improve-restore.mjs:94-106](../../scripts/improve-restore.mjs#L94-L106)). NO --apply gate, NO interactive prompt, NO `--player-email` argv match |

`improve-restore.mjs` lacks the safety harness `restore-player.mjs` carries (CLAUDE.md §15 explicitly notes the surface predates the helper); flagged as inconsistency.

### Scheduled jobs

| Workflow | Schedule | Auth | Permissions |
|---|---|---|---|
| [.github/workflows/audit-readiness-check.yml](../../.github/workflows/audit-readiness-check.yml) | cron `0 7 * * *` | `secrets.DATABASE_URL` (Neon prod connection) | `contents: read`, `issues: write` |
| [.github/workflows/ci.yml](../../.github/workflows/ci.yml) | on push, on pull_request | n/a (no DB) | default `GITHUB_TOKEN` |

The `audit-readiness-check.yml` job runs read-only SQL against prod with the operator's `DATABASE_URL` secret and may open a single GitHub issue when thresholds are met. Permissions are minimum needed.

### Webhooks / websockets / file uploads / third-party callbacks

- **Webhooks:** none. No `/api/webhook*` routes.
- **Websockets:** the Neon serverless driver opens WebSocket connections from the *server* to Neon; no inbound WebSocket from clients to this app.
- **File uploads:** none. No `multipart/form-data` handlers, no `formData()` reads in any route.
- **Third-party callbacks:** Google OAuth callback at `/api/auth/callback/google` (handled by NextAuth, [src/lib/auth.ts:13-17](../../src/lib/auth.ts#L13-L17)).

## 2. Authentication

### Provider configuration

[src/lib/auth.ts](../../src/lib/auth.ts) — NextAuth v5, OAuth-only (Google), JWT sessions, no DB adapter:

- **Single provider:** Google (`next-auth/providers/google`) ([src/lib/auth.ts:14-17](../../src/lib/auth.ts#L14-L17)). Confirmed: no Email provider, no Credentials provider, no other OAuth providers.
- **Session strategy:** `jwt` ([src/lib/auth.ts:19](../../src/lib/auth.ts#L19)). Sessions live in the encrypted JWT cookie.
- **`trustHost: true`** ([src/lib/auth.ts:12](../../src/lib/auth.ts#L12)). Trusts the request `Host` header for callback URLs. Required for Vercel deploys; depends on Vercel's host-header sanitization. Worth noting as a defense-in-depth concern.
- **Callbacks:** carry `email` from `profile` to `token` and from `token` to `session.user.email` ([src/lib/auth.ts:21-30](../../src/lib/auth.ts#L21-L30)). Email is the only PII pulled.

### Cookie defaults (NextAuth v5 / `@auth/core`)

[node_modules/@auth/core/src/lib/utils/cookie.ts:58-100](../../node_modules/@auth/core/src/lib/utils/cookie.ts#L58-L100):

- `httpOnly: true` on every cookie (sessionToken, callbackUrl, csrfToken, pkceCodeVerifier).
- `sameSite: "lax"`.
- `secure: true` on HTTPS (the deploy is Vercel → always HTTPS in prod).
- `__Secure-` prefix on session/callback/PKCE cookies; `__Host-` on the CSRF cookie.
- PKCE verifier cookie has `maxAge: 60 * 15` (15 min) — bounded.

### Session lifecycle

- **Storage:** JWT in HTTP-only cookie (`__Secure-authjs.session-token`).
- **Expiry:** NextAuth default (30 days; not overridden in [src/lib/auth.ts](../../src/lib/auth.ts)).
- **Refresh:** silent JWT renewal on each `auth()` call when within the renewal window.
- **Revocation:** no server-side revocation list (JWT strategy has none by design — sign-out clears the cookie client-side; pre-revocation old JWTs remain valid until expiry).

### OAuth callback handling

NextAuth handles state + PKCE internally via `@auth/core`. PKCE verifier cookie has `httpOnly + secure + sameSite=lax + maxAge=900s`. State cookie is generated per OAuth round-trip, validated on return.

### Password handling

None — confirmed OAuth-only by reading [src/lib/auth.ts](../../src/lib/auth.ts) end-to-end. No password store, no reset flow, no `bcrypt`/`argon2` deps.

### `useReliableSession` retry hook

[src/lib/useReliableSession.ts](../../src/lib/useReliableSession.ts) — client hook that retries `useSession()` once when the localStorage `authCache` says the user *was* authenticated but the live session probe says they're not. Triggered on transient session probe failures. Does NOT bypass auth — it just delays a flip to "unauthenticated" by one update cycle so cached UI doesn't flicker. The retry guard is module-level (`retriedThisSession`) so it can't loop.

### `useOptimisticAuth` hook

[src/lib/useOptimisticAuth.ts](../../src/lib/useOptimisticAuth.ts) — client hook that renders `localStorage`-cached auth status optimistically, then reconciles with the real session. The cache is non-authoritative: every server call still goes through the real `auth()` cookie check.

## 3. Authorization

### Role/permission model

There is **no role model** — every authenticated user has the same access. The only access boundary is **ownership**: a session can only read/write its own `players` row, `save_games` row, `save_audit` rows, and `leaderboard` rows.

### Ownership enforcement

For every authenticated route:

| Route | Ownership check |
|---|---|
| `GET /api/save` | `playerId := upsertPlayerId(session.user.email, ...)` then `where("player_id", "=", playerId)` ([src/app/api/save/route.ts:29-36](../../src/app/api/save/route.ts#L29-L36)). The session's email maps to a single player row; the row is then keyed on that `playerId`. **Cannot read another user's save** — there is no path-param ID accepted. |
| `POST /api/save` | Same `upsertPlayerId` derivation; the upsert key is `(player_id, slot)` ([src/app/api/save/route.ts:386](../../src/app/api/save/route.ts#L386)). |
| `GET /api/handle` | Same — `where("id", "=", playerId)` ([src/app/api/handle/route.ts:37](../../src/app/api/handle/route.ts#L37)). |
| `POST /api/handle` | Update gated on `where("id", "=", playerId)` ([src/app/api/handle/route.ts:91](../../src/app/api/handle/route.ts#L91)). Case-insensitive collision check uses the partial unique index `players_handle_lower_idx`. |
| `POST /api/leaderboard` | Mission-completion guard: looks up the player's `completed_missions` (server-trusted, the row keyed by their `playerId`) and rejects scores for missions not in the list ([src/app/api/leaderboard/route.ts:66-86](../../src/app/api/leaderboard/route.ts#L66-L86)). |

**No path-param IDs anywhere.** Routes are identity-derived (the session email → `playerId`). There is no `GET /api/save/<id>` shape that could mismatch session and target.

### IDOR risk: localStorage `pendingSave` queue

[src/game/state/saveQueue.ts:82-93](../../src/game/state/saveQueue.ts#L82-L93) — every pending save in the browser is stamped with `playerEmail`. Read paths (`readPendingForPlayer`) gate on the stamp matching the current session's email ([src/game/state/saveQueue.ts:169-175](../../src/game/state/saveQueue.ts#L169-L175)). `:v1` blobs (pre-stamp) are silently purged ([src/game/state/saveQueue.ts:125-134](../../src/game/state/saveQueue.ts#L125-L134)). This closes the cross-account-leak vector that PR #100 was designed for. Confirmed working as documented.

### Privilege escalation paths considered

| Vector | Mitigation | Location |
|---|---|---|
| Save-game tampering — credits inflation | `validateCreditsDelta` with per-player progression-aware caps | [src/lib/saveValidation.ts:259-283](../../src/lib/saveValidation.ts#L259-L283) |
| Save-game tampering — playtime inflation (which would loosen the credits cap) | `validatePlaytimeDelta` against wall-clock since prev `updated_at` | [src/lib/saveValidation.ts:310-336](../../src/lib/saveValidation.ts#L310-L336) |
| Save-game tampering — mission unlock-chain bypass | `validateMissionGraph` walks every completed mission's `requires` | [src/lib/saveValidation.ts:203-234](../../src/lib/saveValidation.ts#L203-L234) |
| Save-game wipe (POST INITIAL_STATE over real save) | `validateNoRegression` (no shrink on completedMissions / unlockedPlanets / playedTimeSeconds) | [src/lib/saveValidation.ts:383-418](../../src/lib/saveValidation.ts#L383-L418) |
| Leaderboard tampering — submitting score for uncompleted mission | Mission-completion guard reads server-trusted `completed_missions` | [src/app/api/leaderboard/route.ts:66-86](../../src/app/api/leaderboard/route.ts#L66-L86) |
| Leaderboard tampering — submitting score for legacy mission id | `ScorePayloadSchema` pins to `MissionIdSchema` enum | [src/lib/schemas/save.ts:259-263](../../src/lib/schemas/save.ts#L259-L263) |
| Leaderboard read of arbitrary mission strings | `as MissionId` cast accepts any string and queries by it; unknown strings return empty `entries`. No data exfil — `where mission_id = $1` is parameterized | [src/app/api/leaderboard/route.ts:27](../../src/app/api/leaderboard/route.ts#L27) |

### Admin endpoints

None. There is no `/api/admin/*`, no role flag in the `players` table, no superuser path. The only privilege boundary is "authenticated vs anonymous".

## 4. Input handling

### Validation matrix per entry point

| Entry point | Body / param | Validator | At edge? |
|---|---|---|---|
| `POST /api/save` | request body | `SavePayloadSchema.safeParse` ([src/app/api/save/route.ts:136](../../src/app/api/save/route.ts#L136)) | Yes |
| `POST /api/leaderboard` | request body | `ScorePayloadSchema.safeParse` ([src/app/api/leaderboard/route.ts:49](../../src/app/api/leaderboard/route.ts#L49)) | Yes |
| `POST /api/handle` | request body | `HandlePayloadSchema.safeParse` ([src/app/api/handle/route.ts:60](../../src/app/api/handle/route.ts#L60)) — trim + length + regex | Yes |
| `GET /api/leaderboard` | `mission` query param | type-cast `as MissionId`; passes through to parameterized SQL ([src/app/api/leaderboard/route.ts:27](../../src/app/api/leaderboard/route.ts#L27)) | **Cast, not validated** — see below |
| `GET /api/leaderboard` | `limit` query param | `Number.parseInt` then `Math.min(Math.max(..., 1), 50)` ([src/app/api/leaderboard/route.ts:20-21](../../src/app/api/leaderboard/route.ts#L20-L21)) | Yes |

### Type-trusting / `as` casts at the network edge

Per CLAUDE.md §5 the rule is: **"No `as` casts at the network edge"**. Grep results across `src/app/api/`:

| File:line | Pattern | Verdict |
|---|---|---|
| [src/app/api/leaderboard/route.ts:27](../../src/app/api/leaderboard/route.ts#L27) | `const missionId = missionIdParam as MissionId;` | **Documented exception** ([line 24-26](../../src/app/api/leaderboard/route.ts#L24-L26) explains the rationale: legacy missionIds in the table). The cast value flows into Kysely's parameterized `where mission_id = $1` so SQLi is impossible. Behavior: unknown missionIds return empty `entries`. Cache-key pollution possible but bounded by `unstable_cache`'s eviction. **Conflicts with the §5 rule** as written; intentional and documented. |
| [src/app/api/save/route.ts:131](../../src/app/api/save/route.ts#L131) | `(raw as Record<string, unknown>)` | Gated by `typeof raw === "object" && !Array.isArray(raw)` typeguard on line 129. **Sound narrow**, not a network-edge trust cast. |
| [src/app/api/save/route.ts:268, 282-286, 365](../../src/app/api/save/route.ts#L268) | several `as MissionId[]` / `as readonly MissionId[]` | All read from the **DB's** `prevRow.completed_missions` / `unlocked_planets` (not user input). Acceptable — DB is server-trusted. |
| [src/app/api/save/route.ts:365](../../src/app/api/save/route.ts#L365) | `shipPayload as Record<string, unknown>` | Cast applied to **post-Zod** parsed `body.shipConfig` / `body.ship` (the union schema accepts both new and legacy ship shapes). The runtime shape is one of the schema branches; Zod has already validated. **Acceptable post-validation cast.** |

Grep for `await req.json() as`, `await request.json() as`, `body as `, `as Save` returned **zero matches** outside the contexts above. No naked-JSON casts at the API boundary.

### `validateNoRegression` regression guard

[src/lib/saveValidation.ts:383-418](../../src/lib/saveValidation.ts#L383-L418) — three-field monotonic-shrink guard on `completedMissions` / `unlockedPlanets` / `playedTimeSeconds`. Pure function. The `credits` field is intentionally NOT guarded (market spend is a legitimate down-delta). This is correct per the design notes at [src/lib/saveValidation.ts:339-368](../../src/lib/saveValidation.ts#L339-L368) and CLAUDE.md §11. Do not weaken.

### Sanitization for downstream contexts

| Sink | Sanitization |
|---|---|
| SQL (Postgres) | Kysely parameterized queries; every user-input value flows through `$1`, `$2`, etc. **No string concatenation.** `sql\`...\`` template usages all reference fixed identifiers/literals (`COALESCE(...)`, `EXCLUDED.<col>`, `LOWER(handle)`); no user input is interpolated into a `sql\`\`` template. Verified by grep across [src/lib/leaderboard.ts:110-116](../../src/lib/leaderboard.ts#L110-L116), [src/app/api/handle/route.ts:80](../../src/app/api/handle/route.ts#L80), [src/app/api/save/route.ts:387-395](../../src/app/api/save/route.ts#L387-L395). **No `Kysely<any>`** anywhere. **No `sql.lit(...)`** anywhere. |
| HTML (React) | All user-rendered strings flow through React's auto-escaping JSX. **Zero `dangerouslySetInnerHTML` matches** in `src/`. **Zero `innerHTML` matches** in `src/`. |
| Shell | None — no `child_process`, no `exec`, no `execFile` calls. |
| File paths | Scripts read fixed paths (`db/migrations`, `<repo>/db-backups/`); no user-controlled filename construction. |
| Regex | Only [src/lib/handle.ts:7](../../src/lib/handle.ts#L7) `/^[a-zA-Z0-9_-]+$/` — anchored, character-class only, no ReDoS risk. |
| URLs | `new URL(request.url)` in [src/app/api/leaderboard/route.ts:15](../../src/app/api/leaderboard/route.ts#L15); the URL is `request.url`, server-trusted. `redirect(...)` is not used in API routes (zero grep matches). `router.push(...)` callers ([src/components/GameCanvas.tsx:178,370](../../src/components/GameCanvas.tsx#L178); [src/components/PlayButton.tsx:53,64,70,77](../../src/components/PlayButton.tsx#L53)) all pass static `ROUTES.page.*` constants — no open-redirect path. |

## 5. Secrets and credentials

### Tracked env files

```
$ git ls-files | grep -iE "\.env"
.env.example
```

Only [.env.example](../../.env.example) is tracked — and it contains placeholder values only:

```
DATABASE_URL="postgres://user:password@host/dbname?sslmode=require"
AUTH_SECRET=""
AUTH_URL="http://localhost:3000"
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
```

[.gitignore:36-38](../../.gitignore#L36-L38) excludes `.env`, `.env*.local`. [.gitignore:47](../../.gitignore#L47) excludes `db-backups/`.

### Git history secret scan

`git log -p --all -S <pattern>` for `AUTH_SECRET`, `DATABASE_URL`, `AUTH_GOOGLE_SECRET`, `BEGIN PRIVATE KEY`, `GOCSPX-`, `AKIA`, `ghp_`, `neondb_owner`, `postgres://`:

- **No real secret values** were ever committed. Every match is either a key NAME (`AUTH_SECRET=""`), a placeholder (`postgres://user:password@host/...`), or a **diagnostic-only** route (next bullet).
- Surfaced one historic concern: a `/api/debug-env` route lived briefly in commits `512c045` (2026 timeline, "chore(debug): add temporary /api/debug-env to verify Vercel env injection") and was removed in `e08b1a0` ("chore(debug): remove temporary /api/debug-env diagnostic route"). The route returned `{present: boolean, length: number}` per env var — it **never returned the secret values themselves** ([git show 512c045 -- src/app/api/debug-env/route.ts](../../) — full diff captured in `git log -p` output). Acceptable; the route was correctly designed to leak only metadata, and it's now deleted. No follow-up needed.

### Live env-var reads

```
$ grep -rn "process.env" src/
src/app/layout.tsx:10-14    NEXT_PUBLIC_SITE_URL, VERCEL_PROJECT_PRODUCTION_URL, VERCEL_URL
src/lib/auth.ts:15-16       AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
src/lib/db.ts:88            DATABASE_URL
src/lib/saveValidation.ts:156   NODE_ENV (dev-only console.log gate)
src/lib/auth.test.ts        AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET (test fixtures)
src/lib/db.test.ts          DATABASE_URL (test fixtures)
```

| Source | Location | Server / client | Issue? |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | [src/app/layout.tsx:10](../../src/app/layout.tsx#L10) | server (used at build for metadata) | NEXT_PUBLIC_ prefix → designed to be public. OK. |
| `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL` | [src/app/layout.tsx:11-14](../../src/app/layout.tsx#L11-L14) | build-time | Public hostname. OK. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | [src/lib/auth.ts:15-16](../../src/lib/auth.ts#L15-L16) | server-only | `@/lib/auth` is imported only by `src/app/api/save/route.ts`, `src/app/api/handle/route.ts`, `src/app/api/leaderboard/route.ts`, `src/app/api/auth/[...nextauth]/route.ts` (grep result). **Never imported by a `"use client"` component.** |
| `DATABASE_URL` | [src/lib/db.ts:88](../../src/lib/db.ts#L88) | server-only | Same — `@/lib/db` is imported only by `src/lib/leaderboard.ts` (server-side fetch fn) and the API routes. **Never imported by a `"use client"` component.** |
| `NODE_ENV` | [src/lib/saveValidation.ts:156](../../src/lib/saveValidation.ts#L156) | server | Dev-only gate; safe. |

Grep `process.env` across `src/components/` and `src/game/` (the client-side trees) returned **zero matches** — no secret leaks into client bundles.

### Logging of secrets / PII

| Site | What's logged |
|---|---|
| [src/app/api/save/route.ts:60-62](../../src/app/api/save/route.ts#L60-L62) | `console.error("GET /api/save failed:", err)` + returns `{message: err.message}` to client. **`err.message` is reflected to the client.** Could include DB hostname or stack details depending on `pg` driver. Worth flagging. |
| [src/app/api/save/route.ts:107](../../src/app/api/save/route.ts#L107) | `console.error("[/api/save] save_audit insert failed (save itself proceeds):", err)` — server log only. |
| [src/app/api/save/route.ts:208-209, 403-405](../../src/app/api/save/route.ts#L208-L209) | `console.error("POST /api/save failed:", err)` — server log only. |
| [src/app/api/save/route.ts:251-253, 297-300, 320-323, 348-352](../../src/app/api/save/route.ts#L251-L253) | `console.warn("[/api/save] mission graph violation", session.user.email, ...)` — **logs the player's email** alongside violation details. Server logs only (Vercel function logs). PII in operational logs. |
| [src/app/api/handle/route.ts:42-43, 107-108](../../src/app/api/handle/route.ts#L42-L43) | `console.error(...)` + `{message: err.message}` reflected to client — same pattern as `/api/save`. |
| [src/app/api/leaderboard/route.ts:31-32](../../src/app/api/leaderboard/route.ts#L31-L32) | `console.error("GET /api/leaderboard failed:", err)` — server log only; client gets generic `{error: "server_error"}`. |
| [src/app/api/leaderboard/route.ts:77-81](../../src/app/api/leaderboard/route.ts#L77-L81) | `console.warn("[/api/leaderboard] score for uncompleted mission", session.user.email, missionId)` — logs email + mission. Server logs only. |
| `save_audit` table | rows store `request_payload` (raw JSON body), `prev_snapshot`, `request_ip` (`x-forwarded-for`), `user_agent`. Every authenticated `POST /api/save` writes one. Retention: TBD per [db/migrations/20260503000000_add_save_audit.sql:11-14](../../db/migrations/20260503000000_add_save_audit.sql#L11-L14). **IP addresses are PII (GDPR/UK-GDPR personal data).** Flagged; not critical. |

### Client-bundle secret check

Grep `(NEXT_PUBLIC_|process\.env\.[A-Z])` across `src/components/` and `src/game/` returned **zero matches**. No env-var reads survive into client bundles. The Next.js compiler would inline any `NEXT_PUBLIC_*` reads it found — none exist outside the static-route-rendered `app/layout.tsx`.

### Secret rotation

No rotation tooling (no scripts, no docs). [.env.example](../../.env.example) tells operators to generate `AUTH_SECRET` via `openssl rand -base64 32`. Manual rotation only.

## 6. Data exposure

### API response shapes (PII / internal-ID leak audit)

| Endpoint | Returned fields | Leak? |
|---|---|---|
| `GET /api/save` | `slot, credits, currentPlanet, shipConfig, completedMissions, unlockedPlanets, playedTimeSeconds, seenStoryEntries, currentSolarSystemId, updatedAt` ([src/app/api/save/route.ts:47-58](../../src/app/api/save/route.ts#L47-L58)) | Per-player only (gated by playerId). No other-user data. **Does NOT include `playerId` (UUID) — good.** |
| `GET /api/handle` | `{handle: string \| null}` ([src/app/api/handle/route.ts:39](../../src/app/api/handle/route.ts#L39)) | Public alias only. No email, no UUID. |
| `GET /api/leaderboard` | `[{playerName, score, timeSeconds, createdAt}]` ([src/lib/leaderboard.ts:45-50](../../src/lib/leaderboard.ts#L45-L50)) | Public handle (or generic `"Pilot"` for handle-less players). **Email and Google profile name explicitly NOT included** ([src/lib/leaderboard.ts:42-44](../../src/lib/leaderboard.ts#L42-L44) header). No internal UUID. |

### Error-message exposure

| Site | What's reflected |
|---|---|
| [src/app/api/save/route.ts:62](../../src/app/api/save/route.ts#L62) | `{error: "server_error", message: <err.message>}` on GET 500 |
| [src/app/api/save/route.ts:140-143](../../src/app/api/save/route.ts#L140-L143) | `{error: "validation_failed", issues: <Zod issues>}` on POST 400 — Zod issues include the field path and rejection reason. Useful for clients. **No internal stack traces.** |
| [src/app/api/save/route.ts:209, 405](../../src/app/api/save/route.ts#L209) | `{error: "server_error"}` on POST 500 — **does NOT include `err.message`** (intentional, per CLAUDE.md §7a precedent). |
| [src/app/api/handle/route.ts:42-43, 107-108](../../src/app/api/handle/route.ts#L42-L43) | `{error: "server_error", message: <err.message>}` on 500 |
| [src/app/api/leaderboard/route.ts:32, 104](../../src/app/api/leaderboard/route.ts#L32) | `{error: "server_error"}` on 500 — no message reflected. |

**Inconsistency:** `GET /api/save` and both `/api/handle` paths reflect `err.message` to the client; `POST /api/save` and both `/api/leaderboard` paths do not. The reflected `err.message` from a Neon DB error or auth failure can include hostname / driver details / column names. Worth flagging — a Phase 2 finding should normalize this to the no-reflection variant everywhere except 400-validation-failed.

### Debug / dev-only routes

`/api/debug-env` was removed in commit `e08b1a0` — confirmed with `git ls-files | grep debug` returning empty (only `LeaderboardBriefing` and similar non-debug matches in tracked files; no current `/api/debug*` route). Build-time `next build` produces no `/api/debug*` artifacts.

### Public file storage

[public/](../../public/) is 9.7 MB total. `find public/ -size +500k` returns four music files:

| File | Size |
|---|---|
| `public/audio/music/combat-tutorial.ogg` | 1.2 MB |
| `public/audio/music/menu-theme.ogg` | 1.5 MB |
| `public/audio/music/shop.ogg` | 1.7 MB |
| `public/audio/music/tubernovae-galaxy.ogg` | 1.5 MB |

Per CLAUDE.md §13: **"No file > 500 KB in `public/`. Heavy assets … go to Cloudflare R2 (free egress) or another object store."** Four files violate this rule. Not a security issue per se — flagged as a budget/cost rule violation. Static assets carry no PII / secrets.

`db-backups/` is `.gitignore`-excluded and not in `public/` — confirmed by [.gitignore:47](../../.gitignore#L47). No public path serves backup JSON.

## 7. Database and persistence

### Connection model

[src/lib/db.ts](../../src/lib/db.ts) — single `getDb()` returning a Kysely client wrapping a Neon serverless `Pool`. The pool is module-cached (`_db`) so every Edge invocation reuses it. `connectionString` is `process.env.DATABASE_URL`. No replica/read-only segregation; one pool for everything.

### Query layer

All queries via Kysely's typed query builder. Grep audit:

- **`Kysely<any>`:** zero matches across `src/`.
- **`sql.lit(...)`:** zero matches across the repo.
- **`sql\`...\``:** appears only with fixed identifiers/literals — no user-input interpolation. See §4 sanitization matrix.
- **String concatenation in queries:** none — Kysely's `where`/`insertInto`/`updateTable`/`onConflict` chains are all parameter-bound.

The npm-audit-flagged kysely advisories (GHSA-wmrf-hv6w-mr66, GHSA-8cpq-38p9-67gx) require either `Kysely<any>` or `sql.lit(string)` to exploit — **neither pattern exists** in this codebase.

### Schema namespace

All tables live in the `spacepotatis` Postgres schema per CLAUDE.md §5:

```
$ grep -rn 'spacepotatis\.' db/migrations/
db/migrations/20260424120000_initial_schema.sql:5  CREATE SCHEMA IF NOT EXISTS spacepotatis;
db/migrations/20260424120000_initial_schema.sql:9,16,30  spacepotatis.players, save_games, leaderboard
db/migrations/20260427000000_add_player_handle.sql:8,13  spacepotatis.players
db/migrations/20260429000000_add_seen_story_entries.sql:6  spacepotatis.save_games
db/migrations/20260503000000_add_save_audit.sql:22  spacepotatis.save_audit
db/migrations/20260503010000_persist_current_solar_system.sql:8  spacepotatis.save_games
```

No `public.*` writes. The dbmate tracker table is `public.spacepotatis_schema_migrations` (intentional, [dbmate.toml:9](../../dbmate.toml#L9)).

### Migration safety

[db/migrations/](../../db/migrations/) — five forward-only SQL files. Every migration's `migrate:down` block correctly drops the column/table. None of the up-migrations is **destructive** (no `DROP COLUMN`/`DROP TABLE` in the up direction). The 2026-05-02 wipe was caused by a buggy POST, not a migration; the table-level guards (`save_audit`, `validateNoRegression`) are the response.

### Backup access controls

- `db-backups/` is gitignored ([.gitignore:47](../../.gitignore#L47)).
- [scripts/_lib/dbWriteSafety.mjs](../../scripts/_lib/dbWriteSafety.mjs)'s `writeBackup` writes the prevRow to a JSON file under that directory before any UPDATE.
- Both `restore-player.mjs` and `improve-restore.mjs` call `writeBackup` and treat its failure as a veto. ([scripts/restore-player.mjs:402-419](../../scripts/restore-player.mjs#L402-L419), [scripts/improve-restore.mjs:94-106](../../scripts/improve-restore.mjs#L94-L106)).
- `improve-restore.mjs` skips the `--apply`/`--dry-run`/prompt harness that `restore-player.mjs` carries. The CLAUDE.md §15 contract documents this divergence as predating the helper. It still calls `writeBackup`.

### Connection-string handling

- `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are read from `process.env` only — never hard-coded ([src/lib/db.ts:88](../../src/lib/db.ts#L88), [scripts/migrate.mjs:24](../../scripts/migrate.mjs#L24), [scripts/check-schema.mjs:9](../../scripts/check-schema.mjs#L9), etc.).
- `audit-readiness-check.yml` workflow injects `secrets.DATABASE_URL` — Vercel-managed secret.

### Save-data round-trip integrity

Confirmed via the `/save-roundtrip-audit` skill design + the existing `validateNoRegression`. Phase 2 / 3 must not weaken any of:
- `validateMissionGraph`
- `validateNoRegression`
- `validatePlaytimeDelta`
- `validateCreditsDelta` + `computeCreditCapsForPlayer`
- The `isHydrationCompleted` gate in `saveQueue` / `sync.ts`
- The `playerEmail` stamp on the `pendingSave` localStorage queue (`:v2`)

## 8. Dependencies

### `npm audit` summary

Run on master @ `a09984f`:

```
4 vulnerabilities total (0 critical, 1 high, 3 moderate)
prod: 34, dev: 485, optional: 86, total: 553
```

| Package | Severity | CVE / GHSA | Applies to this codebase? |
|---|---|---|---|
| `kysely` <= 0.28.13 (installed 0.27.6) | high | GHSA-wmrf-hv6w-mr66 (CVSS 8.2) — SQL Injection via unsanitized JSON path keys when ignoring/silencing compilation errors or using `Kysely<any>`. CWE-89. | **NO.** Code uses strictly typed `Kysely<Database>` ([src/lib/db.ts:93](../../src/lib/db.ts#L93)). Zero `Kysely<any>` matches. JSON path operators not used. Fix-available: 0.28.17 (semver-major). |
| `kysely` <= 0.28.13 (installed 0.27.6) | high | GHSA-8cpq-38p9-67gx (CVSS 8.1) — MySQL SQL Injection via insufficient backslash escaping in `sql.lit(string)`. CWE-89. | **NO.** Code is Postgres-only. Zero `sql.lit(...)` matches. Fix-available: 0.28.17 (semver-major). |
| `next-auth` 5.0.0-beta.0 .. 5.0.0-beta.29 (installed 5.0.0-beta.25) | moderate | GHSA-5jpx-9hw9-2fx4 — Email Misdelivery in the Email provider. CWE-200. | **NO.** Code uses Google OAuth provider only — no Email provider configured ([src/lib/auth.ts:13-17](../../src/lib/auth.ts#L13-L17)). Fix-available: 5.0.0-beta.31 (non-major). Should still upgrade for hygiene. |
| `postcss` < 8.5.10 (transitive via `next` `<= 16.3.0-canary.5`) | moderate | GHSA-qx2v-qp2m-jg93 — XSS via Unescaped `</style>` in CSS Stringify Output. CWE-79. | **Indirect / build-time.** PostCSS runs at Next build time over Tailwind input. The XSS surface is when *user-supplied* CSS is round-tripped through PostCSS at runtime — not the case here. Worth tracking; fix is to bump `next` (semver-major fix-available, but listed as `9.3.3` which is wrong direction — likely the audit DB has stale data). |

**Three of four advisories are not exploitable in current code.** The `next-auth` upgrade is hygiene (no relevant exploit path). Keep watching for fresh advisories.

### Postinstall scripts (supply-chain risk)

- This repo's [package.json](../../package.json) declares only `"prepare": "husky"` — sets up the local pre-commit hook. No `postinstall` / `preinstall`.
- Spot-check of top-level deps' `package.json` files for auto-fired install hooks:

| Dep | postinstall / preinstall / prepare |
|---|---|
| `next` 15.5.15 | none |
| `next-auth` 5.0.0-beta.25 | none |
| `kysely` 0.27.6 | none |
| `@neondatabase/serverless` 1.1.0 | has a `version` script (NPM `npm version` hook, not a fire-on-install hook). Not auto-run on `npm install`. |
| `husky` 9.1.7 | runs as our explicit `prepare` script, not their own postinstall |

No surprise auto-execution detected on `npm ci` / `npm install` for top-level deps. (Deep transitive scan not performed in this phase; flagged for a Phase 2 / 5 spot-check.)

### Lockfile

[package-lock.json](../../package-lock.json) is committed. CI runs `npm ci` ([.github/workflows/ci.yml:30](../../.github/workflows/ci.yml#L30)) so lockfile is enforced.

## 9. Network and transport

### HTTPS

- Vercel default: HTTPS for every deploy. HSTS header is added by Vercel's edge.
- `next.config.mjs` sets `poweredByHeader: false` ([next.config.mjs:29](../../next.config.mjs#L29)) — drops the `X-Powered-By: Next.js` fingerprint header. Good.
- `productionBrowserSourceMaps: false` ([next.config.mjs:30](../../next.config.mjs#L30)) — no source maps shipped to clients.

### Security headers

`grep` for `Content-Security-Policy | Strict-Transport-Security | X-Frame-Options | X-Content-Type-Options | Referrer-Policy | Permissions-Policy` across the repo returned **zero matches** outside `.claude/` documentation. `grep` for `async headers` (the Next.js custom-headers function) returned **zero matches**.

| Header | Configured | Default (Vercel/Next) |
|---|---|---|
| `Strict-Transport-Security` | not in code | Vercel adds in prod |
| `Content-Security-Policy` | not in code | none |
| `X-Frame-Options` | not in code | none |
| `X-Content-Type-Options` | not in code | none — Next.js does not set this by default |
| `Referrer-Policy` | not in code | none |
| `Permissions-Policy` | not in code | none |

This is a **defense-in-depth gap.** No CSP means a stored-XSS bug elsewhere has no nonce gate. No `X-Frame-Options` / no CSP `frame-ancestors` means the site can be iframed (clickjacking / overlay attacks against the sign-in flow). Phase 2 should propose at minimum CSP with `frame-ancestors 'self'` and `X-Content-Type-Options: nosniff`.

### CORS

`grep -rn "Access-Control-Allow"` across `src/` returned zero matches outside doc-skill files. **No CORS headers are emitted by any API route.** Default Next.js behavior is same-origin only — fetch from a foreign origin will be blocked by the browser. Acceptable for the current threat model (the game is a same-origin SPA).

### Cookie attributes (NextAuth defaults)

Confirmed in [node_modules/@auth/core/src/lib/utils/cookie.ts:58-100](../../node_modules/@auth/core/src/lib/utils/cookie.ts#L58-L100):

| Cookie | httpOnly | secure | sameSite | prefix |
|---|---|---|---|---|
| `authjs.session-token` | yes | on HTTPS | lax | `__Secure-` |
| `authjs.callback-url` | yes | on HTTPS | lax | `__Secure-` |
| `authjs.csrf-token` | yes | on HTTPS | lax | `__Host-` |
| `authjs.pkce.code_verifier` | yes | on HTTPS | lax | `__Secure-` (maxAge 15m) |

`sameSite: lax` (not `strict`) is the standard NextAuth default. Acceptable — `strict` would break sign-in callback redirects.

## 10. Client-side

### XSS sinks

| Pattern | Matches in `src/` |
|---|---|
| `dangerouslySetInnerHTML` | **0** |
| `innerHTML` | **0** |
| `eval(` | **0** |
| `Function(` | **0** |
| `setTimeout(<string>, ...)`, `setInterval(<string>, ...)` | **0** |

All user-rendered text flows through React's auto-escaping JSX. No CSS-in-JS string interpolation either (Tailwind utility classes only, no `style={...}` with user input).

### Open redirects

`grep` results for `redirect(`, `Response.redirect`, `router.push`, `window.location`:

- `redirect(` — zero matches in `src/`. (NextAuth's internal redirects are framework-managed.)
- `router.push` — only in [src/components/GameCanvas.tsx:178,370](../../src/components/GameCanvas.tsx#L178) and [src/components/PlayButton.tsx:53,64,70,77](../../src/components/PlayButton.tsx#L53). All targets are static `ROUTES.page.*` constants from [src/lib/routes.ts](../../src/lib/routes.ts). **No user input flows into a router target.**
- `window.location.reload()` — single use in [src/components/GameCanvas.tsx:103](../../src/components/GameCanvas.tsx#L103). No URL construction.

No open-redirect path.

### `postMessage`

`grep -rn "postMessage("` and `addEventListener('message'`: **zero matches** in `src/`. The game does not use `postMessage` for cross-origin / cross-frame comms.

### Third-party scripts

Searched for `<Script>` and `<script src=` tags — **zero matches** in `src/`. No analytics, no Google Tag Manager, no third-party JS embed. The only network deps fetched at runtime are:

- Same-origin API routes (`/api/save`, `/api/leaderboard`, `/api/handle`, `/api/auth/*`).
- `@neondatabase/serverless` opens WebSockets server-side (Edge function → Neon).
- Audio + sprite assets from same-origin `/audio/` and `/sprites/`.
- Google OAuth flow redirects to `accounts.google.com` (NextAuth).

### Dynamic imports

Phaser, Three.js, GSAP and the galaxy/combat scene engines are imported via `next/dynamic({ ssr: false })`. The compiled JS is same-origin and integrity-checked by the standard Next.js asset pipeline. No CDN-loaded code.

## 11. Operational

### Rate limiting

`grep -rn "rate.?limit\|rateLimit\|RateLimit\|throttle"` across `src/`: **only matches are inside `itemSfx` audio code** (a sound-effect throttle). **There is no HTTP-layer rate limiting on any API route** — no middleware, no Vercel-side rate limit config, no application-layer counter.

This affects:
- `POST /api/handle` — handle squatting; an authenticated attacker can rapidly try thousands of handles in a brute-force search for desirable strings (the validator is cheap; only the unique-index collision check stops them).
- `POST /api/save` — high-frequency-write spam against Neon. The cheat-guards are pure CPU but they walk every wave of every reachable mission on each call ([src/lib/saveValidation.ts:100-140](../../src/lib/saveValidation.ts#L100-L140)) — a bored attacker could burn CPU.
- `POST /api/leaderboard` — same concern; mission-completion check is one DB roundtrip per attempt.
- `GET /api/leaderboard` — public, unauthenticated. The `unstable_cache(revalidate=60)` absorbs same-(missionId, limit) reads, but **distinct mission strings each create a separate cache entry**. An attacker iterating over random missionId strings can defeat the cache and pin every request to a Neon roundtrip.

Worth flagging as **medium**. Vercel does some platform-level rate limiting at the edge; not a substitute for per-route logic. Phase 2 should propose at minimum a token-bucket per signed-in user on `/api/save` and `/api/handle`, plus IP-bucket on the `GET /api/leaderboard` mission param to cap the number of distinct missionIds it'll accept per IP per minute.

### Account lockout / brute-force protection

OAuth-only: there is no password to brute-force. Account lockout doesn't apply. The Google sign-in flow is rate-limited by Google. Acceptable.

### Logging

| Layer | What's logged | Retention |
|---|---|---|
| Vercel function logs | `console.error` / `console.warn` from API routes (validation rejections, 500s, mission-graph violations, **player emails**) | Vercel default (3-7 days on Hobby) |
| `spacepotatis.save_audit` table | Per-POST `request_payload` (raw JSON), `prev_snapshot` (previous server row), `response_status`, `response_error`, `request_ip` (`x-forwarded-for`), `user_agent` | "TBD" — comment at [db/migrations/20260503000000_add_save_audit.sql:11-14](../../db/migrations/20260503000000_add_save_audit.sql#L11-L14) anticipates 90-day cleanup but none implemented |

The `save_audit` table is the existing PII boundary. It contains:
- IP addresses (PII under EU / UK GDPR).
- User-agent strings (low-PII).
- Save payloads (game state — not PII per se).
- Player UUIDs (server-internal; not reflected to users).

There is **no GDPR right-to-erasure tooling** — if a user requests deletion of their data, the foreign-key cascade on `players.id ON DELETE CASCADE` ([db/migrations/20260424120000_initial_schema.sql:18,32](../../db/migrations/20260424120000_initial_schema.sql#L18) plus the audit migration's analogous FK) means a `DELETE FROM spacepotatis.players WHERE email = $1` will cascade-purge every related row. Adequate for the scale; no documented runbook though.

Vercel logs may also contain emails (the API routes log `session.user.email` on rejection — see §5). PII present there as well; standard Vercel retention applies.

### Monitoring / alerting hooks

None in code. `audit-readiness-check.yml` opens GitHub issues but only for the save-audit-table-readiness milestone — not security alerting.

### CI/CD secrets handling

- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — uses default `GITHUB_TOKEN` only. No project secrets injected. CI does NOT have `DATABASE_URL` (so `npm test` runs without a DB; the codebase designs around this — see CLAUDE.md "Working without a database").
- [.github/workflows/audit-readiness-check.yml:48](../../.github/workflows/audit-readiness-check.yml#L48) — injects `secrets.DATABASE_URL` into one read-only Node script. Workflow has `permissions: contents: read, issues: write`.
- `Co-Authored-By` trailer is forbidden per CLAUDE.md §8 / MEMORY.md.
- Pre-commit hook runs `lint-staged` + `typecheck` ([package.json:54-56](../../package.json#L54-L56), [.husky/pre-commit](../../.husky/pre-commit)).

Vercel deployment secrets: not visible to this audit (managed in Vercel dashboard). Confirmed by [.env.example](../../.env.example) which documents the expected names.

## Inventory summary

| # | Concern | Summary | Refs | Has finding (Y/N) | Preliminary severity hint |
|---|---|---|---|---|---|
| 1 | Trust boundaries — full inventory | 4 API route files, 7 scripts, 2 workflows, 4 page routes; no middleware, no crons | §1 | N | informational |
| 2 | Auth — provider | Google OAuth only, JWT sessions, no DB adapter | [src/lib/auth.ts](../../src/lib/auth.ts) | N | informational |
| 3 | Auth — `trustHost: true` | Trusts request `Host` header | [src/lib/auth.ts:12](../../src/lib/auth.ts#L12) | Y (defense-in-depth) | informational |
| 4 | Auth — cookie attrs | NextAuth defaults: httpOnly + secure + sameSite=lax + `__Secure-`/`__Host-` prefixes | [@auth/core/src/lib/utils/cookie.ts](../../node_modules/@auth/core/src/lib/utils/cookie.ts) | N | n/a |
| 5 | Authz — model | No roles; identity-based ownership only; no path-param IDs | §3 | N | n/a |
| 6 | Authz — IDOR (save queue) | localStorage stamped with playerEmail (`:v2`); `:v1` purged | [src/game/state/saveQueue.ts:82-93,125-134](../../src/game/state/saveQueue.ts#L82-L93) | N | n/a |
| 7 | Authz — save-cheat guards | mission graph + regression + playtime + credits delta + leaderboard mission-completion | [src/lib/saveValidation.ts](../../src/lib/saveValidation.ts) | N (do not weaken) | n/a |
| 8 | Input — Zod at edge | All POST bodies parsed via Zod schemas before any DB I/O | [src/lib/schemas/save.ts](../../src/lib/schemas/save.ts), [src/lib/schemas/handle.ts](../../src/lib/schemas/handle.ts) | N | n/a |
| 9 | Input — `as MissionId` cast | `GET /api/leaderboard` casts user-supplied `mission` string | [src/app/api/leaderboard/route.ts:27](../../src/app/api/leaderboard/route.ts#L27) | Y (CLAUDE.md §5 conflict; cache-key-pollution + DoS surface) | low / medium |
| 10 | Input — sanitization | Kysely-parameterized SQL, React-escaped HTML, no shell, no eval | §4 | N | n/a |
| 11 | Secrets — git history | No real secret ever committed; `/api/debug-env` was metadata-only and is removed | git log -p audit | N | n/a |
| 12 | Secrets — client bundles | Zero `process.env.*` reads in `src/components/` or `src/game/` | grep audit | N | n/a |
| 13 | Secrets — error reflection | `GET /api/save`, both `/api/handle` reflect `err.message` to client; other routes do not | [src/app/api/save/route.ts:62](../../src/app/api/save/route.ts#L62), [src/app/api/handle/route.ts:42-43,107-108](../../src/app/api/handle/route.ts#L42-L43) | Y | low |
| 14 | Logging — PII (player email) in `console.warn` | mission-graph / regression / leaderboard rejections log session.user.email | [src/app/api/save/route.ts:251-252,297-300,320-323,348-352](../../src/app/api/save/route.ts#L251-L252) | Y | low |
| 15 | Logging — PII (request IP) in `save_audit` | `x-forwarded-for` stored per save attempt; retention "TBD" | [src/app/api/save/route.ts:133](../../src/app/api/save/route.ts#L133), [db/migrations/20260503000000_add_save_audit.sql:11-14](../../db/migrations/20260503000000_add_save_audit.sql#L11-L14) | Y | low |
| 16 | Data exposure — leaderboard | Public alias only; never email or Google profile name | [src/lib/leaderboard.ts:42-50](../../src/lib/leaderboard.ts#L42-L50) | N | n/a |
| 17 | Data exposure — public assets > 500 KB | 4 `.ogg` music files in `public/`; CLAUDE.md §13 violation | [public/audio/music/](../../public/audio/music/) | Y (rule violation; non-security) | informational |
| 18 | Database — Kysely safety | No `Kysely<any>`, no `sql.lit`, no string-concatenated SQL; npm-audit kysely advisories don't apply | grep audit | N | n/a |
| 19 | Database — schema namespace | All tables in `spacepotatis.*`; no `public.*` writes | [db/migrations/](../../db/migrations/) | N | n/a |
| 20 | Database — connection-string handling | Always `process.env.DATABASE_URL`; never hard-coded | [src/lib/db.ts:88](../../src/lib/db.ts#L88) | N | n/a |
| 21 | Scripts — `improve-restore.mjs` no dry-run | Runs UPDATE immediately; lacks the safety harness `restore-player.mjs` carries | [scripts/improve-restore.mjs](../../scripts/improve-restore.mjs) | Y (CLAUDE.md §15 documents it as predating helper) | low |
| 22 | Deps — `npm audit` 4 advisories | None applicable to current code paths | §8 | Y (hygiene upgrade) | low |
| 23 | Deps — postinstall scripts | Top-level deps spot-checked clean; no auto-fired hooks | §8 | N | n/a |
| 24 | Deps — lockfile | `package-lock.json` committed; CI uses `npm ci` | [package-lock.json](../../package-lock.json), [.github/workflows/ci.yml:30](../../.github/workflows/ci.yml#L30) | N | n/a |
| 25 | Network — security headers | No CSP, no X-Frame-Options, no X-Content-Type-Options, no Referrer-Policy | grep audit | Y | medium (defense-in-depth) |
| 26 | Network — CORS | None set; default same-origin behavior | grep audit | N | n/a |
| 27 | Network — HTTPS / HSTS | Vercel default | n/a | N | n/a |
| 28 | Client — XSS sinks | Zero `dangerouslySetInnerHTML`/`innerHTML`/`eval`/string-`setTimeout` | grep audit | N | n/a |
| 29 | Client — open redirects | All `router.push` targets are static `ROUTES.page.*` constants | grep audit | N | n/a |
| 30 | Client — `postMessage` / 3rd-party JS | Zero matches | grep audit | N | n/a |
| 31 | Operational — rate limiting | None on any API route | grep audit | Y | medium |
| 32 | Operational — account lockout | OAuth-only; n/a | n/a | N | n/a |
| 33 | Operational — GDPR / right-to-erasure | FK `ON DELETE CASCADE` covers it; no documented runbook | [db/migrations/20260424120000_initial_schema.sql:18,32](../../db/migrations/20260424120000_initial_schema.sql#L18) | Y (process gap, not vuln) | informational |
| 34 | CI/CD — secrets in workflows | `audit-readiness-check.yml` uses `secrets.DATABASE_URL` correctly; CI uses no secrets | [.github/workflows/](../../.github/workflows/) | N | n/a |

## Open questions for the orchestrator

1. **`GET /api/leaderboard` cache-key pollution:** the `as MissionId` cast lets any string become a cache key. Should Phase 2 propose tightening to the `MissionIdSchema` enum (rejects unknown ids with 400), or keep the legacy-id permissiveness documented inline and add an IP-keyed rate limit instead? The trade-off is "old leaderboard rows for retired mission ids" vs "DoS surface."

2. **`improve-restore.mjs`'s missing `--apply` gate:** CLAUDE.md §15 documents it as predating the helper. Phase 3 could either retrofit `parseFlags` + `requireConfirm` or freeze the script as-is. Operator preference?

3. **`save_audit` PII retention:** the migration says "TBD" for cleanup. Phase 2 should ask whether to propose a 30/60/90-day cron + a `DELETE` policy. The active save-audit experiment window (per MEMORY.md) means we cannot remove rows yet — but we can document the policy now and apply it when the GH Actions cron opens the issue.

4. **Error-message reflection inconsistency:** `GET /api/save` and `/api/handle` reflect `err.message` to clients; `POST /api/save` and `/api/leaderboard` do not. Consolidate to the no-reflection variant, or keep `err.message` only for 5xx as a debugging aid? Phase 2 finding pending direction.

5. **`trustHost: true`:** is the deploy target restricted to Vercel-only? If yes, current setting is fine. If a future deploy lands behind a different reverse proxy (Cloudflare Workers, self-hosted Node), the setting should be re-evaluated.

## Next phase (do not start)

**Phase 2** — turn this map into a prioritized list of `SEC-XXX` findings with severity, attack scenarios, recommended fixes (named validators, files, file:line references), verification steps, and a remediation order. The candidates already surfaced by this map (in expected-severity order, not yet finalized):

- **medium** — no security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- **medium** — no rate limiting on `POST /api/handle`, `POST /api/save`, `POST /api/leaderboard`, `GET /api/leaderboard`
- **low / medium** — `GET /api/leaderboard` mission-param `as MissionId` cast: cache-key pollution + DoS surface
- **low** — error-message reflection inconsistency (`err.message` echoed on `GET /api/save` + both `/api/handle` paths)
- **low** — player email logged in `console.warn` on `/api/save` + `/api/leaderboard` rejection paths
- **low** — `save_audit` retention policy unimplemented (PII drift)
- **low** — `improve-restore.mjs` lacks `--apply` gate / interactive prompt
- **low** — public assets > 500 KB (CLAUDE.md §13 rule violation; non-security)
- **informational** — `next-auth` 5.0.0-beta.25 → 5.0.0-beta.31 hygiene upgrade
- **informational** — `trustHost: true` defense-in-depth
- **informational** — GDPR right-to-erasure runbook missing

Phase 2 will produce `docs/security/02-findings-and-plan.md` with the full SEC-XXX templates and a remediation order. Do not start until the user reviews this artifact and types "approved".
