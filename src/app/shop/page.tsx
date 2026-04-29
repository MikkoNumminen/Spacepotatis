import Link from "next/link";
import LoadoutMenu from "@/components/LoadoutMenu";
import ShopUI from "@/components/ShopUI";
import { ROUTES } from "@/lib/routes";

// Shop page — static shell; the ShopUI client component reads/writes
// GameState + ShipConfig in the browser. No server-side data needed.
export const dynamic = "force-static";

export default function ShopPage() {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-center gap-4 sm:gap-5">
        <Link
          href={ROUTES.page.play}
          className="touch-manipulation select-none rounded border border-hud-green/60 px-3 py-1.5 font-mono text-xs text-hud-green/90 transition-colors hover:bg-hud-green/10 active:bg-hud-green/20"
        >
          ← Back
        </Link>
        <h1 className="font-display text-2xl tracking-widest sm:text-3xl">MARKET</h1>
      </header>
      <LoadoutMenu mode="market" />
      <ShopUI />
    </main>
  );
}
