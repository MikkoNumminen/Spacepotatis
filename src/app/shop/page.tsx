import Link from "next/link";
import LoadoutMenu from "@/components/LoadoutMenu";
import ShopUI from "@/components/ShopUI";

// Shop page — static shell; the ShopUI client component reads/writes
// GameState + ShipConfig in the browser. No server-side data needed.
export const dynamic = "force-static";

export default function ShopPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-widest">MARKET</h1>
        <Link
          href="/play"
          className="rounded border border-hud-amber/40 px-3 py-1 text-sm text-hud-amber hover:bg-hud-amber/10"
        >
          ← Back to galaxy
        </Link>
      </header>
      <LoadoutMenu mode="market" />
      <ShopUI />
    </main>
  );
}
