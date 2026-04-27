import { describe, expect, it, vi } from "vitest";

// We don't boot real Auth.js — the route file is just a re-export of
// handlers from @/lib/auth pinned to the Node runtime. The contract worth
// pinning down: it forwards exactly what NextAuth produced, on the runtime
// the comments in the file claim.

const fakeGet = vi.fn(async () => new Response("ok-get"));
const fakePost = vi.fn(async () => new Response("ok-post"));

vi.mock("@/lib/auth", () => ({
  handlers: { GET: fakeGet, POST: fakePost }
}));

describe("/api/auth/[...nextauth]/route", () => {
  it("re-exports the GET and POST handlers from @/lib/auth", async () => {
    const mod = await import("./route");
    expect(mod.GET).toBe(fakeGet);
    expect(mod.POST).toBe(fakePost);
  });

  it("pins the route to the Node runtime (Google OAuth needs Node primitives)", async () => {
    const mod = await import("./route");
    expect(mod.runtime).toBe("nodejs");
  });
});
