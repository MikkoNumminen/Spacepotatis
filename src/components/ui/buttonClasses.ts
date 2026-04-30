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
// Hover/active state is identical across all three: solid space-panel
// background. We deliberately do NOT use hud-green/10 (a translucent
// green tint) anywhere — that combination read as "the button became
// transparent" against the busy 3D galaxy backdrop.

const SHARED_HOVER = "hover:bg-space-panel active:bg-space-panel/80";
const SHARED_TOUCH = "touch-manipulation select-none";

export const BUTTON_PRIMARY = `${SHARED_TOUCH} rounded border border-hud-green/60 px-8 py-3 font-display tracking-widest ${SHARED_HOVER}`;

export const BUTTON_NAV = `${SHARED_TOUCH} rounded border border-space-border px-8 py-2 text-sm text-hud-green/80 ${SHARED_HOVER}`;

export const BUTTON_NAV_COMPACT = `${SHARED_TOUCH} rounded border border-hud-green/60 px-3 py-1.5 text-xs ${SHARED_HOVER}`;

export const BUTTON_BACK = `${SHARED_TOUCH} rounded border border-hud-green/60 px-3 py-1.5 font-mono text-xs text-hud-green/90 ${SHARED_HOVER}`;
