export function WeaponDot({ tint }: { tint: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: tint, boxShadow: `0 0 6px ${tint}` }}
    />
  );
}

export function AugmentDot({ tint, title }: { tint: string; title?: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: tint, boxShadow: `0 0 4px ${tint}` }}
    />
  );
}
