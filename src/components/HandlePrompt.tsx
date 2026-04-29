"use client";

import { useEffect, useRef, useState } from "react";
import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  validateHandle
} from "@/lib/handle";
import { ROUTES } from "@/lib/routes";

// Modal that asks the player to pick a leaderboard handle. Used by
// PlayButton on first PLAY/CONTINUE and any time the account doesn't have a
// handle yet. Pure presentation + a single POST — the parent decides what
// to do once a handle is set (typically: navigate to /play).
export interface HandlePromptProps {
  onSubmit: (handle: string) => void;
  onCancel: () => void;
}

export default function HandlePrompt({ onSubmit, onCancel }: HandlePromptProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const result = validateHandle(value);
    if (!result.ok) {
      setError(result.reason);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(ROUTES.api.handle, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: result.handle })
      });
      if (res.status === 409) {
        setError("That handle is already taken — pick another.");
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { reason?: string; error?: string }
          | null;
        // Surface the status so the player can tell us exactly what they hit
        // (e.g. 401 means session expired, 500 means the column isn't there
        // yet because the DB migration didn't run).
        const detail = body?.reason ?? body?.error ?? `HTTP ${res.status}`;
        setError(`Could not save handle (${detail}). Try again.`);
        setSubmitting(false);
        return;
      }
      const body = (await res.json()) as { handle: string };
      onSubmit(body.handle);
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handle-prompt-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded border border-hud-green/40 bg-space-bg/95 p-5 shadow-[0_0_40px_rgba(94,255,167,0.15)] sm:p-6"
      >
        <h2
          id="handle-prompt-title"
          className="select-none font-display text-lg tracking-widest text-hud-green"
        >
          PICK A HANDLE
        </h2>
        <p className="mt-2 text-xs text-hud-amber/90">
          Shown on the leaderboard. Your Google account stays private.
        </p>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          minLength={HANDLE_MIN_LENGTH}
          maxLength={HANDLE_MAX_LENGTH}
          autoComplete="off"
          spellCheck={false}
          placeholder="potato_pilot"
          className="mt-4 w-full rounded border border-hud-green/30 bg-black/40 px-3 py-2 font-mono text-base text-hud-green outline-none focus:border-hud-green/70"
        />

        <p className="mt-2 text-xs text-hud-amber/70">
          {HANDLE_MIN_LENGTH}-{HANDLE_MAX_LENGTH} chars · letters, numbers, _ or -
        </p>

        {error && <p className="mt-3 text-xs text-hud-red">{error}</p>}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="w-full touch-manipulation select-none rounded border border-hud-green/60 px-4 py-2 font-display text-sm tracking-widest text-hud-green hover:bg-hud-green/10 active:bg-hud-green/20 disabled:opacity-50"
          >
            {submitting ? "SAVING..." : "CONFIRM"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full touch-manipulation select-none rounded border border-hud-amber/50 px-4 py-2 font-display text-xs tracking-widest text-hud-amber hover:bg-hud-amber/10 active:bg-hud-amber/20"
          >
            CANCEL
          </button>
        </div>
      </form>
    </div>
  );
}
