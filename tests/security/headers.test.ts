import { describe, it, expect } from "vitest";
import { getSecurityHeaders } from "../../src/lib/securityHeaders";

describe("SEC-001 — security headers in next.config.mjs", () => {
  it("returns a headers() block with CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy applied to all routes", async () => {
    const blocks = await getSecurityHeaders();
    expect(blocks.length).toBeGreaterThan(0);
    const allRoutesBlock =
      blocks.find((b) => b.source === "/(.*)") ?? blocks[0];
    if (!allRoutesBlock) {
      throw new Error("No header block found in getSecurityHeaders() result");
    }
    const headerMap = new Map(
      allRoutesBlock.headers.map((h) => [h.key, h.value])
    );
    expect(headerMap.get("X-Frame-Options")).toBe("DENY");
    expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headerMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerMap.get("Permissions-Policy")).toMatch(/camera=\(\)/);
    const csp = headerMap.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/connect-src .*accounts\.google\.com/);
  });
});
