import MuteToggle from "@/components/MuteToggle";
import ShopShell from "@/components/ShopShell";
import ShopTabs from "@/components/ShopTabs";
import StickyHeader from "@/components/ui/StickyHeader";
import ShopCreditsTicker from "@/components/ui/ShopCreditsTicker";
import { ROUTES } from "@/lib/routes";

// Shop page — static shell; the ShopShell client wrapper holds the boot
// splash up while auth + cloud save load, then reveals the rest of the
// page. ShopTabs (client) owns the MARKET / GARAGE tab state and renders
// ShopUI (MARKET) or LoadoutMenu (GARAGE) on demand. No server-side
// data needed — the page stays `force-static`.
//
// Page title is "SHOP" because MARKET is now one of the two tabs and
// would be confusing as the page title too.
export const dynamic = "force-static";

export default function ShopPage() {
  return (
    <ShopShell>
      <main className="relative mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 pb-6 sm:gap-8 sm:px-6 sm:pb-10">
        <StickyHeader
          backHref={ROUTES.page.play}
          title="SHOP"
          right={
            <div className="flex items-center gap-3">
              <MuteToggle />
              <ShopCreditsTicker />
            </div>
          }
        />
        <ShopTabs />
      </main>
    </ShopShell>
  );
}
