// Shared Tailwind class strings for menu / nav buttons across the app.
// Keep every menu's button look in lockstep — without this, drift creeps
// in (one button uses translucent green hover, another uses solid panel
// hover, etc.) and the player notices.
//
// Variants in use today:
//   - BUTTON_PRIMARY: the page's main action — PLAY/CONTINUE on landing,
//     CONTINUE button on cinematic story modals, BIG CTA in modals.
//     Bold + tracking-widest + px-8 py-3.
//   - BUTTON_NAV: secondary navigation links beside the primary action —
//     Leaderboard, Sign in. Smaller, dimmer border, smaller text.
//   - BUTTON_BACK: the back affordance used inside modals and at the top
//     of /shop + /leaderboard pages. Small, hud-green border, mono font.
//
// Hover/active state is identical across all variants: a translucent
// green tint that picks up the HUD palette without going opaque. The
// previous version of this used hud-green/10 (too see-through against
// the busy 3D backdrop) and bg-space-panel (too opaque, broke the
// "we're floating in space" feel). 20%/30% is the sweet spot — clearly
// readable as "hovered" but the starfield still bleeds through.

const SHARED_HOVER = "hover:bg-hud-green/20 active:bg-hud-green/30";
const SHARED_TOUCH = "touch-manipulation select-none";
// Landing-page nav buttons share a fixed h-12 flex box so PLAY/CONTINUE,
// Leaderboard, and the sign-in/out chip line up at the same height even
// though they use different text sizes (base vs. sm). Width fills the
// parent nav (items-stretch + max-w-xs).
const SHARED_LANDING_BOX = "flex h-12 items-center justify-center px-8";

export const BUTTON_PRIMARY = `${SHARED_TOUCH} ${SHARED_LANDING_BOX} rounded border border-hud-green/60 font-display tracking-widest ${SHARED_HOVER}`;

export const BUTTON_NAV = `${SHARED_TOUCH} ${SHARED_LANDING_BOX} rounded border border-space-border text-sm text-hud-green/80 ${SHARED_HOVER}`;

export const BUTTON_BACK = `${SHARED_TOUCH} rounded border border-hud-green/60 px-3 py-1.5 font-mono text-xs text-hud-green/90 ${SHARED_HOVER}`;
