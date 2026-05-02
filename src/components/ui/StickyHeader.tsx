import Link from "next/link";
import { BUTTON_BACK } from "./buttonClasses";

// Shared sticky page header. Used by /shop and /leaderboard so the back
// button + title don't scroll out of reach on long pages, and (in the
// shop's case) the player's credit balance stays visible while they
// scroll through the catalog.
//
// Two visual concerns this component handles so consumers don't have to:
//
//  1. The bar's background is fully OPAQUE (`bg-space-bg`). Content that
//     scrolls past disappears completely behind it — no half-transparent
//     panel-border-stripe poking through, which is what the old "sticky
//     with backdrop-blur" pattern produced.
//
//  2. A 16px linear-gradient mask under the bar fades the page bg into
//     transparent. Panel borders that approach the bar's bottom edge
//     dissolve into the dark over a few px instead of getting clipped at
//     a hard line — keeps the page from looking sliced.
//
// The right-side slot is optional. /shop fills it with a live credits
// readout; /leaderboard leaves it empty.
//
// `mainPaddingY` defaults to the value /shop and /leaderboard use — the
// page-level <main> originally owned the top padding, but with a sticky
// header the bar is what creates the visible "header band" so the page's
// content needs only a small gap from the bar's bottom edge. Consumers
// pass the original padding through so the header band breathes the same
// way the original non-sticky header did.
export interface StickyHeaderProps {
  readonly backHref: string;
  readonly title: string;
  readonly right?: React.ReactNode;
}

export default function StickyHeader({
  backHref,
  title,
  right
}: StickyHeaderProps) {
  return (
    <div className="sticky top-0 z-30">
      <div className="flex flex-wrap items-center gap-4 bg-space-bg py-3 sm:gap-5 sm:py-4">
        <Link href={backHref} className={BUTTON_BACK}>
          ← Back
        </Link>
        <h1 className="font-display text-2xl tracking-widest sm:text-3xl">
          {title}
        </h1>
        {right ? <div className="ml-auto">{right}</div> : null}
      </div>
      <div
        className="pointer-events-none h-4 bg-gradient-to-b from-space-bg to-transparent"
        aria-hidden="true"
      />
    </div>
  );
}
