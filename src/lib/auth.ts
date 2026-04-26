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
  providers: [Google],
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
