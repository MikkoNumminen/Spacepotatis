import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "space-bg": "#05060f",
        "space-panel": "#0b0d1c",
        "space-border": "#1f2340",
        "hud-green": "#5effa7",
        "hud-red": "#ff4d6d",
        "hud-amber": "#ffcc33",
        "laser-cyan": "#4fd1ff"
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
        display: ["'Orbitron'", "system-ui", "sans-serif"]
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite"
      }
    }
  },
  plugins: []
};

export default config;
