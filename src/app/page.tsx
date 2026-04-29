import Link from "next/link";
import LandingBackground from "@/components/LandingBackground";
import LandingShell from "@/components/LandingShell";
import MenuBriefing from "@/components/MenuBriefing";
import MuteToggle from "@/components/MuteToggle";
import PlayButton from "@/components/PlayButton";
import SignInButton from "@/components/SignInButton";
import { ROUTES } from "@/lib/routes";

// Landing page. Static by design — the Three.js backdrop, sign-in button and
// play button are all client islands that hydrate after delivery. The
// LandingShell client wrapper holds the boot splash up until the auth status
// is verified so the buttons don't pop in mid-render.
export const dynamic = "force-static";

export default function Home() {
  return (
    <>
      <LandingBackground />
      <div className="absolute right-3 top-3 z-20 font-mono text-xs sm:right-6 sm:top-6">
        <MuteToggle />
      </div>
      <LandingShell>
        <MenuBriefing />
        <main className="relative z-10 mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-8 px-4 text-center sm:gap-10 sm:px-6">
          {/* Mobile-only dark panel backgrounds keep the title + nav readable
              over the busy 3D galaxy on small screens. Desktop has plenty of
              negative space and the panels read as ugly frames there — strip
              them at sm+ via sm:bg-transparent + sm:p-0. */}
          <div className="rounded-2xl bg-black/35 px-5 py-5 backdrop-blur-sm sm:rounded-none sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <h1 className="font-display text-4xl tracking-widest text-hud-green drop-shadow-[0_0_20px_rgba(94,255,167,0.45)] sm:text-5xl">
              SPACEPOTATIS
            </h1>
            <p className="mt-3 text-sm text-hud-amber">
              Vertical shooter · 3D galaxy overworld · one potato at a time
            </p>
          </div>

          <nav className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl bg-black/35 px-5 py-5 backdrop-blur-sm sm:max-w-none sm:rounded-none sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <PlayButton />
            <Link
              href={ROUTES.page.leaderboard}
              className="touch-manipulation select-none rounded border border-space-border px-8 py-2 text-sm text-hud-green/80 hover:bg-space-panel active:bg-space-panel/80"
            >
              Leaderboard
            </Link>
            <div className="pt-2">
              <SignInButton />
            </div>
          </nav>
        </main>
      </LandingShell>
    </>
  );
}
