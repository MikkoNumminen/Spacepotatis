import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * NextAuth v5 / Auth.js config.
 *
 * MVP auth surface is deliberately tiny: Google OAuth only, JWT sessions,
 * no adapter (we look players up in our own `players` table on-demand inside
 * API routes — saves a round trip on every auth check).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  // SECURITY-CRITICAL: trustHost: true makes @auth/core fall back to the
  //   request's Host / X-Forwarded-Host header for callback-URL construction
  //   when AUTH_URL is unset. In production we rely on TWO upstream guards:
  //     1. Vercel sanitizes the Host header upstream of this code.
  //     2. Google's OAuth Console allow-list pins the redirect URI to the
  //        canonical production URL — a spoofed Host that builds a different
  //        callback URL is rejected by Google.
  //   PIN AUTH_URL in the Vercel env vars (Production AND Preview) to the
  //   canonical production URL so this code path stops depending on the
  //   request headers; if the deploy ever migrates off Vercel or the Google
  //   Console allow-list loosens, this becomes account-takeover-class.
  //   See SEC-012 in docs/security/02b-attack-cells.md.
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
      // Carry email through to the session so API routes can look up the
      // player record without an extra DB call inside auth middleware.
      if (profile?.email) token.email = profile.email;
      return token;
    },
    async session({ session, token }) {
      if (token.email) session.user.email = token.email;
      return session;
    }
  }
});
