import Link from "next/link";
import LandingBackground from "@/components/LandingBackground";
import PlayButton from "@/components/PlayButton";
import UserMenu from "@/components/UserMenu";
import { ROUTES } from "@/lib/routes";

// Landing page. Static by design — the Three.js backdrop, sign-in button and
// play button are all client islands that hydrate after delivery.
export const dynamic = "force-static";

export default function Home() {
  return (
    <>
      <LandingBackground />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 text-center">
        <div className="rounded-2xl bg-black/35 px-8 py-6 backdrop-blur-sm">
          <h1 className="font-display text-5xl tracking-widest text-hud-green drop-shadow-[0_0_20px_rgba(94,255,167,0.45)]">
            SPACEPOTATIS
          </h1>
          <p className="mt-3 text-sm text-hud-amber">
            Vertical shooter · 3D galaxy overworld · one potato at a time
          </p>
        </div>

        <nav className="flex flex-col items-center gap-3 rounded-2xl bg-black/35 px-6 py-5 backdrop-blur-sm">
          <PlayButton />
          <Link
            href={ROUTES.page.leaderboard}
            className="rounded border border-space-border px-8 py-2 text-sm text-hud-green/80 hover:bg-space-panel"
          >
            Leaderboard
          </Link>
          <div className="pt-2">
            <UserMenu />
          </div>
        </nav>
      </main>
    </>
  );
}
