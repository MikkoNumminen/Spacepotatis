import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Spacepotatis",
  description: "Tyrian 2000-inspired vertical scrolling space shooter with a 3D galaxy overworld.",
  icons: { icon: "/favicon.ico" }
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
