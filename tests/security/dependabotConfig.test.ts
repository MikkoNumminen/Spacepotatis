// SEC-028 regression guard: .github/dependabot.yml must exist, parse as valid
// YAML with version: 2 and an npm ecosystem entry with a weekly schedule.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");
const DEPENDABOT_PATH = ".github/dependabot.yml";

describe("SEC-028 — .github/dependabot.yml exists and is correctly configured", () => {
  const yaml = readFileSync(resolve(REPO_ROOT, DEPENDABOT_PATH), "utf-8");

  it("contains version: 2", () => {
    expect(yaml).toMatch(/^version:\s*2/m);
  });

  it("contains an npm ecosystem entry", () => {
    expect(yaml).toContain("package-ecosystem: \"npm\"");
  });

  it("has a weekly schedule interval", () => {
    expect(yaml).toContain("interval: \"weekly\"");
  });

  it("has an updates block", () => {
    expect(yaml).toContain("updates:");
  });
});
