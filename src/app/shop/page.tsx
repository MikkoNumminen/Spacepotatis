import LoadoutMenu from "@/components/LoadoutMenu";
import ShopUI from "@/components/ShopUI";
import StickyHeader from "@/components/ui/StickyHeader";
import ShopCreditsTicker from "@/components/ui/ShopCreditsTicker";
import { ROUTES } from "@/lib/routes";

// Shop page — static shell; the ShopUI client component reads/writes
// GameState + ShipConfig in the browser. No server-side data needed.
export const dynamic = "force-static";

export default function ShopPage() {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 pb-6 sm:gap-8 sm:px-6 sm:pb-10">
      <StickyHeader backHref={ROUTES.page.play} title="MARKET" right={<ShopCreditsTicker />} />
      <LoadoutMenu mode="market" />
      <ShopUI />
    </main>
  );
}
