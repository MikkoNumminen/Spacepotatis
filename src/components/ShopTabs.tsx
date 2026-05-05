"use client";

import { useState } from "react";
import LoadoutMenu from "@/components/LoadoutMenu";
import ShopUI from "@/components/ShopUI";

// /shop is split into two tabs:
// - MARKET: HULL & SHIELD + REACTOR + BUY WEAPONS + BUY AUGMENTS (LoadoutMenu
//   doesn't render here — pure purchase view).
// - GARAGE: SHIP LOADOUT (slot grid + EQUIPPED + INVENTORY + AUGMENT
//   INVENTORY) — pure equip/manage view.
//
// Tab state is local-only `useState` for v1. If deep-linking (?tab=garage)
// becomes a need (e.g. linking from a mission-result CTA "→ check your
// loadout"), promote to a `useSearchParams`/`useRouter` pair — the page
// stays `force-static` either way because the searchParam is read on the
// client. Default tab is MARKET because that's the post-mission flow:
// player lands at /shop with credits to spend.
type ShopTab = "market" | "garage";

const TAB_HINTS: Readonly<Record<ShopTab, string>> = {
  market: "Buy weapons, augments, hull and reactor upgrades",
  garage: "Equip slots and review your inventory"
};

export default function ShopTabs() {
  const [tab, setTab] = useState<ShopTab>("market");

  return (
    <>
      <div role="tablist" aria-label="Shop sections" className="flex flex-wrap gap-2">
        <TabPill
          tab="market"
          active={tab === "market"}
          onClick={() => setTab("market")}
        />
        <TabPill
          tab="garage"
          active={tab === "garage"}
          onClick={() => setTab("garage")}
        />
      </div>
      <div role="tabpanel" aria-label={tab.toUpperCase()}>
        {tab === "market" ? <ShopUI /> : <LoadoutMenu />}
      </div>
    </>
  );
}

function TabPill({
  tab,
  active,
  onClick
}: {
  tab: ShopTab;
  active: boolean;
  onClick: () => void;
}) {
  // Active tab: filled amber pill matching the upgrade-button accent.
  // Inactive: dim outlined pill matching the DETAILS-style chip.
  const cls = active
    ? "border-hud-amber bg-hud-amber/10 text-hud-amber"
    : "border-space-border text-hud-green/60 hover:border-hud-green/40 hover:text-hud-green/80";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={TAB_HINTS[tab]}
      className={`touch-manipulation select-none rounded border px-3 py-1.5 font-display text-sm tracking-widest transition-colors ${cls}`}
    >
      {tab.toUpperCase()}
    </button>
  );
}
