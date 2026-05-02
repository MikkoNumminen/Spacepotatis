// Validation rules for the public-facing handle. Kept in a tiny standalone
// module so both the API route and the client-side form can apply identical
// rules without dragging Edge-only or Node-only deps across the boundary.

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 16;
export const HANDLE_PATTERN = /^[a-zA-Z0-9_-]+$/;

export type HandleValidation = { ok: true; handle: string } | { ok: false; reason: string };

export function validateHandle(raw: unknown): HandleValidation {
  if (typeof raw !== "string") return { ok: false, reason: "Handle is required." };
  const trimmed = raw.trim();
  if (trimmed.length < HANDLE_MIN_LENGTH) {
    return { ok: false, reason: `Handle must be at least ${HANDLE_MIN_LENGTH} characters.` };
  }
  if (trimmed.length > HANDLE_MAX_LENGTH) {
    return { ok: false, reason: `Handle must be at most ${HANDLE_MAX_LENGTH} characters.` };
  }
  if (!HANDLE_PATTERN.test(trimmed)) {
    return { ok: false, reason: "Handle may contain letters, numbers, underscore, and hyphen only." };
  }
  return { ok: true, handle: trimmed };
}
