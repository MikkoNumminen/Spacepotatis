import type { ReactNode } from "react";

// Shared catalog-panel shell for the /shop market sections (BUY WEAPONS,
// AUGMENTS, HULL & SHIELD/REACTOR). Extracted after the 2026-05-31
// ai-codegen smell audit flagged the panel + heading chrome repeating
// verbatim across the three sibling sections under `shop/`. The shell is
// the constant; `className` merges any extra layout classes a section
// needs (e.g. AUGMENTS spans both grid columns via `md:col-span-2`).
//
// Scope note: deliberately NOT applied to the /leaderboard server-component
// panels (Leaderboard/TopPilots/page) — different render context, and those
// were freshly churned in the force-dynamic rework. If a fourth client-side
// catalog panel appears, prefer this primitive over a fourth copy.
export function CatalogSection({
  title,
  className,
  children
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded border border-space-border bg-space-panel/70 p-4 sm:p-5${
        className ? ` ${className}` : ""
      }`}
    >
      <h2 className="mb-4 font-display tracking-widest text-hud-green">{title}</h2>
      {children}
    </section>
  );
}
