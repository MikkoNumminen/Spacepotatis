import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: path.join(here, "src") + "/$1" }
    ]
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs", "tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", "out"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.tsx",
        // Three.js scenes — every file requires a real WebGL context to run.
        // Cannot meaningfully cover from node without spinning up a headless GL.
        "src/game/three/**/*.ts",
        // Phaser scenes + entities — require a real Phaser game (BootScene
        // alone is 1600+ lines of asset loading + sprite generation, all
        // gated on a live Phaser.Game instance).
        "src/game/phaser/scenes/**/*.ts",
        "src/game/phaser/entities/**/*.ts",
        // Phaser typed-wrapper config files — registry/event names, scene-key
        // constants, and the createPhaserGame factory. Wrappers exist for
        // type safety; their runtime is one-line passthrough into Phaser.
        "src/game/phaser/registry.ts",
        "src/game/phaser/events.ts",
        "src/game/phaser/config.ts",
        // React-lifecycle hooks — need a React renderer (jsdom + RTL or
        // similar) to test sensibly. Excluded until the test harness gains
        // a React test environment.
        "src/components/hooks/**/*.ts",
        "src/lib/useHandle.ts",
        "src/game/state/useGameState.ts",
        // Pure presentational helpers / Tailwind class strings — no logic
        // worth covering. Either pure projections over typed data or
        // string templates consumed by JSX.
        "src/components/loadout/selectors.ts",
        "src/components/ui/buttonClasses.ts"
      ],
      // RATCHET GATE — `vitest run --coverage` (npm run coverage, the CI test
      // step) exits non-zero if any metric drops below these floors. Set
      // ~5 points below the 2026-06-13 measured baseline (stmts 89.23 / branch
      // 81.89 / funcs 88.11 / lines 92.86), so honest churn doesn't false-fail
      // but an assertion-gutting drop (>~5 pts) trips CI.
      //
      // These RATCHET: when coverage rises durably, raise the floors to match
      // (keeping the ~5-pt margin). NEVER lower a floor to make a red PR green
      // — that's the regression the gate exists to catch; add the missing test
      // instead. Excludes above are the legitimate "can't unit-test from node"
      // set (WebGL/Phaser/React-hook surfaces); widen those, not the floors,
      // if a genuinely-untestable file lands.
      thresholds: {
        statements: 84,
        branches: 76,
        functions: 83,
        lines: 87
      }
    }
  }
});
