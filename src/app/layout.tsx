import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

const description =
  "Tyrian 2000-inspired vertical scrolling space shooter with a 3D galaxy overworld. Starring a potato.";

export const metadata: Metadata = {
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
      </body>
    </html>
  );
}
