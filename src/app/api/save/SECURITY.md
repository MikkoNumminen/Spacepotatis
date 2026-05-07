# `src/app/api/save` — security notes

This is the most security-sensitive route in the codebase. It is the only
mutation path for player progression, and the 2026-05-02 wipe lived here. A
"simplification" that flattens any of the layers below re-introduces the
wipe scenario.

## Threat mitigated

- **Save tamperer** (threat-model A4): an authenticated attacker crafts a
  POST body to inflate credits, unlock missions they have not earned,
  inflate playtime to loosen the credits cap, or overwrite a legitimate
  save with INITIAL_STATE.
- **Concurrent stale-baseline overwrite** (SEC-013): two parallel POSTs
  each pass the validators against the same pre-write baseline and the
  loser overwrites the winner.
- **Audit-table storage DoS amplifier** (SEC-011): an authenticated
  attacker POSTs a 4 MB body and amplifies it into 4 MB of Neon storage
  per request via the audit row.
- **Validator-ordering side-channel** (SEC-020): a 422 response code
  reveals which guard fired in which order.

## Invariants enforced

- INV-SAVE-1 — prev-row SELECT + validators + upsert run inside ONE
  `db.transaction().execute(async (trx) => …)` with `.forUpdate()` on
  the SELECT (`route.ts:247-490`, `.forUpdate()` at ~line 263).
- INV-SAVE-2 — cheat-guard validators are pure server-side checks,
  imported from `src/lib/saveValidation.ts`.
- INV-SAVE-3 — `validateNoRegression` guards three monotonic fields,
  intentionally NOT credits.
- INV-SAVE-4 — credit-cap input derives from `prevRow.completed_missions`
  via `deriveCapInputMissions` (route.ts:393).
- INV-SAVE-5 — `currentSolarSystemId` must be in submitted
  `unlockedSolarSystems` (route.ts:423-446).
- INV-SAVE-6 — `save_audit.request_payload` is capped at
  `AUDIT_PAYLOAD_BYTE_CAP` (64 KB) before insert (route.ts:73, ~line
  99-115).
- INV-SAVE-7 — `writeSaveAudit` runs OUTSIDE the transaction; failure
  never blocks the save (route.ts:87-135 + call sites at ~line
  496-547).
- INV-SAVE-8 — 422 rejection codes collapse to `save_rejected` in the
  client response, EXCEPT `save_regression` (saveQueue.ts treats
  save_regression as TRANSIENT — collapsing it would break durability).
- INV-LOG-1 — `console.warn` on rejection paths logs `playerId` (UUID),
  not `session.user.email`.
- INV-LOG-2 — 5xx response body is `{ error: "server_error" }` only;
  `err.message` is never reflected.
- INV-SCHEMA-1 — `SavePayloadSchema.safeParse(raw)` runs BEFORE any DB
  I/O (route.ts:162).

## What MUST NOT change without security review

- **The transaction wrapper in POST.** Removing the
  `db.transaction(...)` block, dropping `.forUpdate()`, or moving any
  validator outside the transaction re-opens SEC-013.
- **The order of validators.** Mission graph → no-regression → playtime
  → credits → unlock-check is the order. Changing the order subtly
  affects which 422 fires first, and the playtime → credits dependency
  is load-bearing (the credits cap depends on `playedTimeSeconds`, so
  catching an inflated playtime first prevents it from unlocking a
  bigger credits budget).
- **`deriveCapInputMissions` as the cap input source.** Replacing it
  with `body.completedMissions` directly (or "for simplicity") re-opens
  SEC-017.
- **The `clientError` collapse for 422 responses.** Reverting it to
  always-emit-the-specific-code re-opens SEC-020 and breaks the
  saveQueue's transient-vs-permanent semantics for `save_regression`.
- **`writeSaveAudit` placement OUTSIDE the transaction.** Moving it
  inside means an audit-table outage rolls back legitimate saves
  (SEC-013 deviation note).
- **`AUDIT_PAYLOAD_BYTE_CAP` and the truncation logic.** Lifting the
  cap or removing the truncation re-opens SEC-011.
- **Logging `playerId` instead of `session.user.email`.** Reverting to
  email logging re-opens SEC-005.

## Common mistakes

- **"Just hoist the SELECT outside the transaction for caching"** —
  the SELECT is the FOR-UPDATE row lock that prevents the TOCTOU race.
  Hoisting it defeats the entire transaction (SEC-013).
- **"Just use `body.completedMissions` for the cap; the validator
  already checked the graph"** — the validator only checks internal
  consistency of the body, not whether the body is grounded in the
  server-stored prev row. The whole point of `deriveCapInputMissions`
  is that distinction (SEC-017).
- **"Move `writeSaveAudit` inside the transaction so it's atomic with
  the save"** — atomicity is the wrong goal. The audit is for
  diagnostics; the save is the user-visible outcome. Coupling them
  means a Neon outage on `save_audit` breaks every save.
- **"Reflect `err.message` on 5xx so clients can debug"** — the client
  cannot fix Kysely errors. Server logs (`console.error`) carry the
  full error; the client gets `{ error: "server_error" }` (SEC-004).
- **"Drop the truncation and let pg handle large bodies — Postgres
  jsonb is fine with 4 MB"** — the Postgres column accepts it; the
  problem is that an attacker can amplify a single 4 MB request into
  unbounded `save_audit` storage. The cap is the second layer behind
  the Zod array `.max()` caps.

## How to test changes safely

- `npm test -- tests/security/saveRace.test.ts` — SEC-013 transaction
  wrapper.
- `npm test -- tests/security/auditAmplification.test.ts` — SEC-011
  schema cap + audit truncation.
- `npm test -- tests/security/creditCapCircular.test.ts` — SEC-017
  cap derivation.
- `npm test -- tests/security/currentSolarSystemUnlock.test.ts` —
  SEC-027 unlock check.
- `npm test -- tests/security/validatorOpaqueCode.test.ts` — SEC-020
  collapsed 422 codes.
- `npm test -- tests/security/saveLoggingPii.test.ts` — SEC-005 PII
  logging.
- `npm test -- tests/security/errorReflection.test.ts` — SEC-004
  error reflection.
- `npm run save-roundtrip-audit` (the slash skill) before any commit
  that touches the route.
- Manual smoke: sign in, complete a mission, reload — the cleared
  mission must persist. If the regression-guard test below trips on
  a normal save, you've broken `validateNoRegression`.
