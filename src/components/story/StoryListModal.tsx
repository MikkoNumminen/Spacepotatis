"use client";

import { useEffect } from "react";
import { STORY_ENTRIES, type StoryId } from "@/game/data/story";

// Lists every narrative beat the player has unlocked so they can replay
// the cinematic from the user menu. Entries the player hasn't yet seen are
// omitted entirely (no spoilers — even the title is hidden).
export default function StoryListModal({
  seenStoryEntries,
  onReplay,
  onClose
}: {
  seenStoryEntries: readonly StoryId[];
  onReplay: (id: StoryId) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const seen = new Set(seenStoryEntries);
  const visible = STORY_ENTRIES.filter((e) => seen.has(e.id));

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-space-bg/80 p-3 backdrop-blur-sm sm:p-6">
      <div className="relative w-[min(28rem,100%)] rounded border border-hud-amber/60 bg-space-panel/95 p-5 shadow-[0_0_40px_rgba(255,204,51,0.15)] sm:p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute left-3 top-3 z-10 min-h-[44px] touch-manipulation select-none rounded border border-hud-green/60 px-3 py-1.5 font-mono text-xs text-hud-green/90 transition-colors hover:bg-hud-green/10 active:bg-hud-green/20"
        >
          ← Back
        </button>
        <div className="text-center font-display text-base tracking-widest text-hud-amber">
          STORY LOG
        </div>
        <div className="mt-6 space-y-2">
          {visible.length === 0 ? (
            <p className="text-center text-xs text-hud-green/50">
              No story entries unlocked yet.
            </p>
          ) : (
            visible.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded border border-hud-amber/30 bg-space-bg/40 px-3 py-2"
              >
                <div className="text-sm text-hud-green/90">{entry.title}</div>
                <button
                  type="button"
                  onClick={() => onReplay(entry.id)}
                  className="touch-manipulation select-none rounded border border-hud-amber/60 px-3 py-1 text-xs font-display tracking-widest text-hud-amber hover:bg-hud-amber/10 active:bg-hud-amber/20"
                >
                  REPLAY
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
