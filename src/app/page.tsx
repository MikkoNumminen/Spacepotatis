import Link from "next/link";
import SignInButton from "@/components/SignInButton";

// Landing page. Static by design — the sign-in button is a client island.
export const dynamic = "force-static";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 text-center">
      <div>
        <h1 className="font-display text-5xl tracking-widest text-hud-green drop-shadow-[0_0_20px_rgba(94,255,167,0.35)]">
          SPACEPOTATIS
        </h1>
        <p className="mt-3 text-sm text-hud-amber">
          Vertical shooter · 3D galaxy overworld · one potato at a time
        </p>
      </div>

      <nav className="flex flex-col gap-3">
        <Link
          href="/play"
          className="rounded border border-hud-green/60 px-8 py-3 font-display tracking-widest hover:bg-hud-green/10"
        >
          PLAY
        </Link>
        <Link
          href="/leaderboard"
          className="rounded border border-space-border px-8 py-2 text-sm text-hud-green/80 hover:bg-space-panel"
        >
          Leaderboard
        </Link>
        <div className="pt-2">
          <SignInButton />
        </div>
      </nav>

    </main>
  );
}
