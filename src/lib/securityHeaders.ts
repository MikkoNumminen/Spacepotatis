import type { NextConfig } from "next";

type HeadersConfig = Awaited<
  ReturnType<NonNullable<NextConfig["headers"]>>
>;

/**
 * Returns the security header blocks for next.config.mjs.
 *
 * Extracted into a plain .ts module so it can be unit-tested without
 * importing the .mjs config file directly (which TypeScript can't type-check
 * because allowJs is false).
 *
 * SEC-001: 'unsafe-inline' on script-src and style-src is required today
 * because Next.js injects inline scripts and styles at runtime.
 * A future hardening pass can replace this with a nonce-based CSP
 * (Next.js 15 supports generateBuildId + nonce injection via middleware).
 */
export async function getSecurityHeaders(): Promise<HeadersConfig> {
  return [
    {
      // Apply to every route including API routes.
      source: "/(.*)",
      headers: [
        {
          key: "Content-Security-Policy",
          value:
            "default-src 'self'; " +
            "img-src 'self' data: blob:; " +
            "media-src 'self'; " +
            "script-src 'self' 'unsafe-inline'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com; " +
            "frame-ancestors 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self' https://accounts.google.com"
        },
        {
          // Belt-and-braces alongside frame-ancestors 'none' for older
          // browsers that don't parse CSP frame-ancestors.
          key: "X-Frame-Options",
          value: "DENY"
        },
        {
          key: "X-Content-Type-Options",
          value: "nosniff"
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin"
        },
        {
          // WebAudio (used by the SFX engine) doesn't require any of these
          // grants, so we can lock them all down.
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        }
      ]
    }
  ];
}
