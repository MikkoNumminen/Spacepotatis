// Single source of truth for client-side route paths. The Next.js App Router
// derives API and page URLs from filesystem positions (src/app/api/**/route.ts
// and src/app/**/page.tsx), so the route handlers themselves don't import
// these — only client `fetch()` callers and `router.push` / `<Link href>`
// consumers do. Keeping them centralized makes a future rename a one-file
// change instead of a grep-and-pray.
export const ROUTES = {
  api: {
    save: "/api/save",
    handle: "/api/handle",
    leaderboard: "/api/leaderboard"
  },
  page: {
    home: "/",
    play: "/play",
    shop: "/shop",
    leaderboard: "/leaderboard"
  }
} as const;
