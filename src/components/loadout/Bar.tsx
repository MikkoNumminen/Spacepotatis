// Vertical-bar primitive shared across loadout-side stat
// visualizations (AugmentDetailsModal's before/after diagram,
// LoadoutDpsGraph's per-slot strip). Pure presentation —
// height is driven by `pct` (0-100), tint is freeform CSS colour
// (typically `weapon.tint` or a state-derived value), value /
// caption labels sit above and below the frame.
//
// Sizing (`h-24 w-8`) is fixed: 96px tall, 32px wide. The frame's
// `overflow-hidden` clips the inner fill so the colour can't overshoot
// the rounded corners. The `aria-hidden` on the inner div keeps screen
// readers focused on the visible text labels.

export interface BarProps {
  readonly value: number;
  readonly unit: string;
  readonly pct: number;
  readonly caption: string;
  readonly tint: string;
}

export function Bar({ value, unit, pct, caption, tint }: BarProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="font-mono text-[11px] text-hud-amber">
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
      <div className="relative h-24 w-8 overflow-hidden rounded border border-space-border bg-space-bg/60">
        <div
          className="absolute bottom-0 left-0 right-0 transition-all duration-300 ease-out"
          style={{ height: `${pct}%`, backgroundColor: tint }}
          aria-hidden
        />
      </div>
      <span className="font-mono text-[9px] uppercase tracking-widest text-hud-green/60">
        {caption}
      </span>
    </div>
  );
}
