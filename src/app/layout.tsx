import type { Metadata } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-space-bg text-hud-green antialiased">
        <Providers>{children}</Providers>
        <MenuMusic />
      </body>
    </html>
  );
}
