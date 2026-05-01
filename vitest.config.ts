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
    include: ["src/**/*.test.ts"],
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
      ]
    }
  }
});
