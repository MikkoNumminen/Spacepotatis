// eslint-config-next v16 ships native flat-config arrays per entry point, so
// FlatCompat is no longer needed (and breaks: piping the v16 plugin export
// through FlatCompat produced a circular ref that crashed config-validator —
// see PR #285 CI on commit 36e897a). The migration drops the eslintrc shim
// entirely and spreads the v16 exports directly.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// ---------------------------------------------------------------------------
// Module-boundary enforcement (CLAUDE.md §17 / ARCHITECTURE.md §11).
//
// The codebase is 10 modules with a STRICT ACYCLIC dependency graph; cross-
// module imports may only point "downward". These rules turn that graph from
// prose into a CI gate so the infra→state class of back-edge (closed in
// PR #289) and the audio→content value edge (closed 2026-06-13) cannot
// silently return. Each zone override below forbids the `@/<module>` paths
// that module must NOT import. `allowTypeImports: true` permits a compile-time
// `import type` (erased at build, no runtime edge) where a type-only
// dependency is an accepted exception.
//
// Test files are intentionally exempt — the modular audit (Phase 5) blessed a
// handful of deep-path test imports (e.g. player-entity tests reaching
// @/game/state/ShipConfig for fixtures). Boundary discipline is a
// production-code invariant; tests may reach wherever they must to isolate.
//
// Dynamic `import()` is NOT matched by no-restricted-imports, so the
// intentional code-split deep imports (ui → @/game/three/GalaxyScene, etc.)
// are unaffected by design.
// ---------------------------------------------------------------------------
// Each module's import-target globs cover BOTH spellings of a cross-module
// import:
//   - `@/<path>` + `@/<path>/**`  — the `@/` alias (the repo convention).
//   - `**/*/<dir>` + `**/*/<dir>/**` — any RELATIVE path that resolves into the
//     module (`../state`, `../../game/state`, `../../../three`, …). The leading
//     `**/*/` requires at least one path segment before `<dir>`, so a BARE npm
//     package name (`three`, `phaser`) can never match — only a relative
//     traversal that contains the segment does. This closes the relative-path
//     escape that pure-alias globs miss (no-restricted-imports matches the
//     literal specifier string, not a resolved path).
const MODULE_GLOBS = {
  types: ["@/types", "@/types/**", "**/*/types", "**/*/types/**"],
  schemas: ["@/lib/schemas", "@/lib/schemas/**", "**/*/schemas", "**/*/schemas/**"],
  audio: ["@/game/audio", "@/game/audio/**", "**/*/audio", "**/*/audio/**"],
  content: ["@/game/data", "@/game/data/**", "**/*/data", "**/*/data/**"],
  state: ["@/game/state", "@/game/state/**", "**/*/state", "**/*/state/**"],
  three: ["@/game/three", "@/game/three/**", "**/*/three", "**/*/three/**"],
  phaser: ["@/game/phaser", "@/game/phaser/**", "**/*/phaser", "**/*/phaser/**"],
  app: ["@/app", "@/app/**", "**/*/app", "**/*/app/**"],
  ui: ["@/components", "@/components/**", "**/*/components", "**/*/components/**"],
  // infra = the whole src/lib tree (includes schemas). Zones that may depend
  // on `schemas` but not the rest of infra (only `state` today) simply don't
  // list `infra` in their deny set and rely on the more specific entries.
  infra: ["@/lib", "@/lib/**", "**/*/lib", "**/*/lib/**"],
};

const BOUNDARY_TEST_IGNORES = ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**"];

// specs: array of { mod, typeOnlyOk?, note? }
function denyModules(specs) {
  return {
    "@typescript-eslint/no-restricted-imports": [
      "error",
      {
        patterns: specs.map(({ mod, typeOnlyOk, note }) => ({
          group: MODULE_GLOBS[mod],
          allowTypeImports: Boolean(typeOnlyOk),
          message:
            `Module-boundary violation (CLAUDE.md §17): this module may not import the \`${mod}\` module` +
            (typeOnlyOk ? " as a VALUE (a type-only `import type` is allowed)." : ".") +
            (note ? ` ${note}` : "") +
            " The dependency graph is acyclic — imports point downward only.",
        })),
      },
    ],
  };
}

const moduleBoundaryConfigs = [
  {
    // types — the leaf. Imports nothing from any other module.
    files: ["src/types/**/*.{ts,tsx}"],
    ignores: BOUNDARY_TEST_IGNORES,
    rules: denyModules([
      { mod: "schemas" }, { mod: "audio" }, { mod: "content" }, { mod: "state" },
      { mod: "three" }, { mod: "phaser" }, { mod: "app" }, { mod: "ui" }, { mod: "infra" },
    ]),
  },
  {
    // schemas — depends on types. Two accepted non-type edges (not denied
    // below, documented here): `@/lib/handle` (pure HANDLE_* constants shared
    // with validateHandle) and `@/game/data` WEAPON_IDS (the runtime id list
    // lives in content to keep Zod out of client bundles). schemas→state is
    // TYPE-ONLY (ship-shape types in save.ts).
    files: ["src/lib/schemas/**/*.{ts,tsx}"],
    ignores: BOUNDARY_TEST_IGNORES,
    rules: denyModules([
      // state is type-only-allowed (ship-shape types in save.ts); the MODULE_GLOBS
      // relative globs cover both alias and `../../game/state` spellings.
      { mod: "state", typeOnlyOk: true },
      { mod: "audio" }, { mod: "three" }, { mod: "phaser" }, { mod: "app" }, { mod: "ui" },
    ]),
  },
  {
    // audio — depends on types. content is allowed TYPE-ONLY (itemSfx imports
    // `type PerkId`); the cleared-state roster math lives in content and audio
    // consumes its booleans (see docs/audit/04-found-bugs.md 2026-06-13).
    files: ["src/game/audio/**/*.{ts,tsx}"],
    ignores: BOUNDARY_TEST_IGNORES,
    rules: denyModules([
      // content is type-only-allowed (itemSfx `import type PerkId`); the
      // MODULE_GLOBS relative globs cover the `../data` / `../../game/data`
      // spellings as well as the alias.
      { mod: "content", typeOnlyOk: true },
      { mod: "state" }, { mod: "three" }, { mod: "phaser" },
      { mod: "app" }, { mod: "ui" }, { mod: "infra" },
    ]),
  },
  {
    // content — depends on types (+ schemas at the CI drift gate ONLY, which is
    // a test and thus exempt). Production content must NOT import schemas at
    // runtime (Zod bundle-weight invariant, content/README.md) — denying
    // `infra` (whole lib, incl schemas) enforces exactly that. Never reaches
    // state/engines/UI either.
    files: ["src/game/data/**/*.{ts,tsx}"],
    ignores: BOUNDARY_TEST_IGNORES,
    rules: denyModules([
      { mod: "audio" }, { mod: "state" }, { mod: "three" }, { mod: "phaser" },
      { mod: "app" }, { mod: "ui" }, { mod: "infra" },
    ]),
  },
  {
    // infra — depends on schemas, types, content. The back-edge guard: infra
    // must NOT import state (the PR #289 regression class).
    files: ["src/lib/**/*.{ts,tsx}"],
    ignores: ["src/lib/schemas/**", ...BOUNDARY_TEST_IGNORES],
    rules: denyModules([
      { mod: "state" }, { mod: "audio" }, { mod: "three" }, { mod: "phaser" },
      { mod: "app" }, { mod: "ui" },
    ]),
  },
  {
    // state — depends on content, schemas, types, and infra (forward edges:
    // routes, authCache, useHandle, useReliableSession). Never the engines/UI.
    files: ["src/game/state/**/*.{ts,tsx}"],
    ignores: BOUNDARY_TEST_IGNORES,
    rules: denyModules([
      { mod: "audio" }, { mod: "three" }, { mod: "phaser" }, { mod: "app" }, { mod: "ui" },
    ]),
  },
  {
    // three — depends on content + types only.
    files: ["src/game/three/**/*.{ts,tsx}"],
    ignores: BOUNDARY_TEST_IGNORES,
    rules: denyModules([
      { mod: "audio" }, { mod: "state" }, { mod: "phaser" },
      { mod: "infra" }, { mod: "app" }, { mod: "ui" },
    ]),
  },
  {
    // phaser — depends on content, state, audio, types.
    files: ["src/game/phaser/**/*.{ts,tsx}"],
    ignores: BOUNDARY_TEST_IGNORES,
    rules: denyModules([
      { mod: "three" }, { mod: "infra" }, { mod: "app" }, { mod: "ui" },
    ]),
  },
  {
    // ui — a SINK that mounts engines; depends on everything below. The only
    // illegal direction is reaching into the app router.
    files: ["src/components/**/*.{ts,tsx}"],
    ignores: BOUNDARY_TEST_IGNORES,
    rules: denyModules([{ mod: "app" }]),
  },
];

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "node_modules/**",
      "coverage/**",
      ".claude/**",
      // Dev-only recall-calibration tooling (Node scripts + fixture JSON). Not
      // shipped, not part of the typecheck graph (allowJs:false). Lives here so
      // the content-audit defect fixtures version with the content they probe.
      "calibration/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "prefer-const": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // eslint-config-next v16 enabled three new react-hooks rules that flag
      // 23 pre-existing legitimate patterns across hooks + components:
      //   - react-hooks/set-state-in-effect (18 sites): setState() inside a
      //     useEffect body. React-19 best practice prefers deriving during
      //     render or using a transition; refactoring is real engineering
      //     work and risks behavior drift in load-bearing useEffects (auth
      //     cache, save sync, Phaser/Three scene rigs).
      //   - react-hooks/refs (5 sites): ref read/write timing.
      //   - react/use: misuses of the use() hook.
      // Deferring all three to a dedicated React-19 migration PR rather than
      // bundling 19-file behavior changes into a dependency bump. Re-enable
      // (one rule at a time) as the migration lands.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react/use": "off",
    },
  },
  {
    files: ["src/game/**/*.{ts,tsx}"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["scripts/**/*.{js,mjs,cjs}"],
    rules: {
      "no-console": "off",
    },
  },
  // Security-tagged rules. Each rule below ties to a specific finding from
  // docs/security/02-findings-and-plan.md / 02b-attack-cells.md. The inline
  // `// reason: SEC-XXX ...` comment is required so a future agent doesn't
  // disable the rule without thinking. Audit Phase 4 (security-doc-writer).
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // reason: SEC-001 — banning dangerouslySetInnerHTML closes the only React
      // sink that can introduce an XSS bug post-render. The CSP from SEC-001
      // is the second layer; this lint is the first. If a legitimate use ever
      // appears, add an inline `// eslint-disable-next-line ... -- reason: ...`
      // comment justifying the source of the HTML.
      "react/no-danger": "error",
    },
  },
  {
    // reason: SEC-005 + general PII-hygiene — env vars (especially server-only
    // ones like AUTH_SECRET, DATABASE_URL) must not be read from
    // src/components/** or src/game/** because those trees ship to the
    // client. Reading them in client-side code would inline the value into
    // the static bundle. Server-side reads should live in src/lib/ or
    // src/app/api/** (and src/app/layout.tsx for the public NEXT_PUBLIC_*
    // metadata, intentional). To bypass for an exceptional case, add an
    // inline `// eslint-disable-next-line ... -- reason: SEC-... <details>`.
    files: ["src/components/**/*.{ts,tsx}", "src/game/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env']",
          message:
            "process.env reads are forbidden in client-side code. Move the read to src/lib/ or src/app/api/, or pass the value down as a prop. See SEC-005 / docs/security/invariants.md INV-LOG-1.",
        },
      ],
    },
  },
  {
    // reason: SEC-014 + INV-SCHEMA-1 — `as SavePayload` / `as ScorePayload` /
    // `as Save` / `as RemoteSave` casts at the network edge would bypass the
    // Zod parse boundary. Restricted only inside route handlers under
    // src/app/api/**/route.ts; helper modules legitimately type-narrow on
    // already-parsed values.
    files: ["src/app/api/**/route.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSAsExpression > TSTypeReference[typeName.name=/^(SavePayload|ScorePayload|RemoteSave)$/]",
          message:
            "`as SavePayload` / `as ScorePayload` / `as RemoteSave` at the network edge bypasses the Zod parse boundary. Use SchemaName.safeParse(raw) instead. See CLAUDE.md §5 and docs/security/invariants.md INV-SCHEMA-1.",
        },
      ],
    },
  },
  // Module-boundary enforcement (CLAUDE.md §17). Spread last so these
  // per-zone no-restricted-imports rules win over any earlier config for the
  // same files. See the MODULE_GLOBS / denyModules block above for the model.
  ...moduleBoundaryConfigs,
];

export default eslintConfig;
