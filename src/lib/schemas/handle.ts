// Runtime schema for the /api/handle POST body. Mirrors the field rules in
// src/lib/handle.ts validateHandle() so the schema is the sole source of truth
// for the wire format. The client-side form keeps using validateHandle()
// directly because it doesn't need a Zod parse to render an inline error;
// the rules below stay 1:1 with that function so both code paths agree.

import { z } from "zod";

import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  HANDLE_PATTERN,
  type HandleValidation
} from "@/lib/handle";

// .trim() runs as a transform so the parsed output is the cleaned handle,
// which is exactly what the route writes to the DB. Length + pattern checks
// run AFTER the trim so "  ab  " fails for being too short rather than
// for containing whitespace — matching validateHandle()'s behavior.
export const HandlePayloadSchema = z.object({
  handle: z
    .string({ message: "Handle is required." })
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(HANDLE_MIN_LENGTH, {
          message: `Handle must be at least ${HANDLE_MIN_LENGTH} characters.`
        })
        .max(HANDLE_MAX_LENGTH, {
          message: `Handle must be at most ${HANDLE_MAX_LENGTH} characters.`
        })
        .regex(HANDLE_PATTERN, {
          message: "Handle may contain letters, numbers, underscore, and hyphen only."
        })
    )
});

export type HandlePayload = z.infer<typeof HandlePayloadSchema>;

// Drift guard — if validateHandle's success branch ever drifts away from
// emitting `{ handle: string }`, this assignment fails to typecheck and
// forces the schema's output type to be re-aligned with it.
type _HandleValidationSuccess = Extract<HandleValidation, { ok: true }>;
const _drift = (x: HandlePayload): { handle: _HandleValidationSuccess["handle"] } => x;
void _drift;
