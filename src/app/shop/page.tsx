import Link from "next/link";
import ShopUI from "@/components/ShopUI";

// Shop page — static shell; the ShopUI client component reads/writes
// GameState + ShipConfig in the browser. No server-side data needed.
export const dynamic = "force-static";

export default function ShopPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-widest">TATER MARKET</h1>
        <Link href="/play" className="text-sm text-hud-amber hover:underline">
          ← Back to galaxy
        </Link>
      </header>
      <ShopUI />
    </main>
  );
}
