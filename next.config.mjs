// Spacepotatis Next.js configuration.
//
// Strategy: hybrid static-first build.
// - Marketing/game pages are rendered as static HTML at build time via
//   `export const dynamic = "force-static"` in each route segment.
// - A small number of API routes (save/load, leaderboard, auth) run as
//   serverless functions — Edge Runtime where possible.
// - Phaser + Three.js are client-only; never import them in a Server Component.
//
// We intentionally do NOT use `output: "export"` because that disables API
// routes entirely. Instead we rely on per-route static-ness to keep the
// Vercel CPU budget low.

import bundleAnalyzer from "@next/bundle-analyzer";

// `openAnalyzer: false` so `ANALYZE=true npm run build` writes the reports
// to disk (under .next/analyze/) without auto-launching three browser
// tabs. Open them manually when you actually want to look — that's almost
// never (the per-route size summary printed to stdout is enough for the
// common case).
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["three", "gsap"]
  }
};

export default withBundleAnalyzer(nextConfig);
