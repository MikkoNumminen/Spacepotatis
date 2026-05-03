import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Dev-loop sanity checks. Catches mistakes in the developer-facing
// scaffolding that CI on Linux would otherwise silently miss because Linux
// runs hooks differently than Windows / macOS git.
//
// The 2026-05-02 incident: a husky reinstall stripped the shebang from
// .husky/pre-commit. Linux git fell back to /bin/sh; Windows git tried to
// exec the file directly and failed with "Exec format error". Every commit
// from a Windows dev was blocked. CI was green because Linux didn't care.
//
// This test pins the contract that all husky hooks have a portable shebang
// so the dev loop works on every platform. Pre-commit specifically is the
// load-bearing hook (lint-staged + typecheck); breaking it silently
// degrades code-review quality.

describe("dev-loop scaffolding", () => {
  it(".husky/pre-commit starts with a shell shebang", () => {
    const path = resolve(process.cwd(), ".husky", "pre-commit");
    const content = readFileSync(path, "utf8");
    const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
    expect(firstLine).toMatch(/^#!\/usr\/bin\/env\s+sh\b/);
  });

  it(".husky/pre-commit invokes lint-staged", () => {
    const path = resolve(process.cwd(), ".husky", "pre-commit");
    const content = readFileSync(path, "utf8");
    expect(content).toMatch(/lint-staged/);
  });

  it(".husky/pre-commit invokes typecheck", () => {
    const path = resolve(process.cwd(), ".husky", "pre-commit");
    const content = readFileSync(path, "utf8");
    expect(content).toMatch(/typecheck/);
  });
});
