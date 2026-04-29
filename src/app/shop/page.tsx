import Link from "next/link";
import LoadoutMenu from "@/components/LoadoutMenu";
import ShopUI from "@/components/ShopUI";
import { ROUTES } from "@/lib/routes";

// Shop page — static shell; the ShopUI client component reads/writes
// GameState + ShipConfig in the browser. No server-side data needed.
export const dynamic = "force-static";

export default function ShopPage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <Link
        href={ROUTES.page.play}
        className="fixed left-6 top-6 z-10 rounded border border-hud-green/60 px-3 py-1.5 font-mono text-xs text-hud-green/90 transition-colors hover:bg-hud-green/10"
      >
        ← Back
      </Link>
      <header>
        <h1 className="font-display text-3xl tracking-widest">MARKET</h1>
      </header>
      <LoadoutMenu mode="market" />
      <ShopUI />
    </main>
  );
}
