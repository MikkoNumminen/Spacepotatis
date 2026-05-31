import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

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
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "prefer-const": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
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
];

export default eslintConfig;
