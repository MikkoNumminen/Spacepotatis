// SEC-024 regression guard: .husky/pre-commit must invoke lint-staged via
// `npx --no lint-staged` (or the local bin path) to prevent a supply-chain
// auto-download when the local cache is cold.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");
const HOOK_PATH = ".husky/pre-commit";

describe("SEC-024 — .husky/pre-commit uses npx --no to block auto-download", () => {
  const hook = readFileSync(resolve(REPO_ROOT, HOOK_PATH), "utf-8");

  it("invokes lint-staged with npx --no flag", () => {
    expect(hook).toMatch(/npx\s+--no\s+lint-staged/);
  });

  it("does not invoke lint-staged without --no flag via plain npx", () => {
    // Must not have bare `npx lint-staged` (without the --no flag)
    expect(hook).not.toMatch(/npx\s+lint-staged(?!\s+--)/);
  });
});
