import LoadoutMenu from "@/components/LoadoutMenu";
import ShopShell from "@/components/ShopShell";
import ShopUI from "@/components/ShopUI";
import StickyHeader from "@/components/ui/StickyHeader";
import ShopCreditsTicker from "@/components/ui/ShopCreditsTicker";
import { ROUTES } from "@/lib/routes";

// Shop page — static shell; the ShopShell client wrapper holds the boot
// splash up while auth + cloud save load, then reveals the rest of the
// page. ShopUI reads/writes GameState + ShipConfig in the browser. No
// server-side data needed.
export const dynamic = "force-static";

export default function ShopPage() {
  return (
    <ShopShell>
      <main className="relative mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 pb-6 sm:gap-8 sm:px-6 sm:pb-10">
        <StickyHeader backHref={ROUTES.page.play} title="MARKET" right={<ShopCreditsTicker />} />
        <LoadoutMenu mode="market" />
        <ShopUI />
      </main>
    </ShopShell>
  );
}
