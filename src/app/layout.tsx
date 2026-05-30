import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import MenuMusic from "@/components/MenuMusic";

const description =
  "Tyrian 2000-inspired vertical scrolling space shooter with a 3D galaxy overworld. Starring a potato.";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05060f",
  // Emits <meta name="color-scheme" content="dark"> into <head>. The
  // browser reads this during initial document parse — BEFORE the linked
  // stylesheet's `:root { color-scheme: dark }` applies — so the backdrop
  // it paints during a route transition (paint-holding between the old
  // route unmounting and the new one's first paint) is dark, not the
  // user-agent light default. This is the actual fix for the white flash;
  // the inline element backgrounds (below + globals.css) only cover the
  // painted elements, not the inter-frame backdrop the browser owns.
  colorScheme: "dark"
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Spacepotatis",
  description,
  openGraph: {
    title: "Spacepotatis",
    description,
    type: "website",
    siteName: "Spacepotatis"
  },
  twitter: {
    card: "summary_large_image",
    title: "Spacepotatis",
    description
  }
};

// Inline dark background on both html and body. Why both:
//   - globals.css already sets `html, body { background-color: space-bg }`,
//     but during a client-side page navigation the browser briefly paints
//     the document chrome (scrollbars, beyond-viewport background, the
//     space between an old route unmounting and a new one mounting) using
//     whatever the user-agent default is — on most platforms that's
//     white. Inline `style` wins the cascade and is applied even before
//     the linked stylesheet's `@layer base` has been processed.
//   - The `body` className still carries `bg-space-bg` for selector-based
//     tooling (devtools, screenshot fidelity); the inline style guarantees
//     correctness even when className-derived CSS hasn't matched yet.
// `colorScheme` here mirrors the viewport meta so the value is also applied
// as a computed style on the element itself the instant it parses — belt and
// suspenders against the white navigation flash. `backgroundColor` paints the
// html/body surfaces dark even before the cascade resolves.
const SPACE_BG_INLINE: React.CSSProperties = {
  backgroundColor: "#05060f",
  colorScheme: "dark"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={SPACE_BG_INLINE}>
      <body
        className="min-h-dvh bg-space-bg text-hud-green antialiased"
        style={SPACE_BG_INLINE}
      >
        <Providers>{children}</Providers>
        <MenuMusic />
      </body>
    </html>
  );
}
