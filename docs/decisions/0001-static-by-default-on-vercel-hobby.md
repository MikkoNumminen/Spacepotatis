# ADR 0001: Static-by-default rendering on Vercel Hobby tier

Date: 2026-05-04
Status: accepted

## Context

Spacepotatis ships on the Vercel Hobby tier. The relevant quotas are tight:
100k function invocations, 100 GB-hours of CPU, and 100 GB of egress per month.
A single uncached endpoint linked on social media can drain a month's budget
in hours. The game itself is a Phaser + Three.js client app, so almost no
work *needs* to happen on the server — auth, save, leaderboard, and OAuth
callback are the only true server functions in the system.

We needed a default rendering posture that biases every new page toward
zero invocations and forces a deliberate decision to opt into Functions.

## Decision

Every Next.js page exports `export const dynamic = "force-static"`; API
routes are the only Functions; Edge runtime is preferred over Node where
possible; middleware is forbidden on game routes.

## Consequences

- Pro: pages precompute at build time and serve from the edge cache for free.
  The marketing-traffic worst case is a wave of cached HTML hits, not a
  function-invocation bill.
- Pro: Phaser and Three.js are dynamically imported with `ssr: false`, so
  game engines never execute during SSR — bundles split cleanly and SSR
  compute stays at zero.
- Pro: API surface is small and auditable — auth, save, leaderboard, handle.
  Each new route requires a one-line cost note in the PR body (see
  CLAUDE.md §13 checklist).
- Con: dynamic personalisation on a page (per-user content above the fold)
  forces an explicit ISR / fully-dynamic justification, slowing down "just
  add a page" work.
- Con: middleware is off the table for game routes, so global per-request
  hooks (rate-limiting, geo-blocking) need a different shape.
- Pro: leaderboard reads are cached with `revalidate: 60`; mutations call
  `revalidateTag` so the cache self-flushes without a poller.
- The architecture's load-bearing constraint is now codified — see
  CLAUDE.md §3 for the principle and §13 for the per-PR checklist.
