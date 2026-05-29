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
  themeColor: "#05060f"
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
const SPACE_BG_INLINE: React.CSSProperties = { backgroundColor: "#05060f" };

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
