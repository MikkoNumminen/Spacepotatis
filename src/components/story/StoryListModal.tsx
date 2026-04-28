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
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-space-bg/80 backdrop-blur-sm">
      <div className="relative w-[28rem] rounded border border-hud-amber/60 bg-space-panel/95 p-6 shadow-[0_0_40px_rgba(255,204,51,0.15)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute left-3 top-3 rounded border border-hud-amber/40 px-2 py-1 text-[11px] text-hud-amber hover:bg-hud-amber/10"
        >
          ← Back
        </button>
        <div className="mt-4 text-center font-display text-base tracking-widest text-hud-amber">
          STORY LOG
        </div>
        <div className="mt-6 space-y-2">
          {visible.length === 0 ? (
            <p className="text-center text-[11px] text-hud-green/50">
              No story entries unlocked yet.
            </p>
          ) : (
            visible.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded border border-hud-amber/30 bg-space-bg/40 px-3 py-2"
              >
                <div className="text-sm text-hud-green/90">{entry.title}</div>
                <button
                  type="button"
                  onClick={() => onReplay(entry.id)}
                  className="rounded border border-hud-amber/60 px-3 py-1 text-[11px] font-display tracking-widest text-hud-amber hover:bg-hud-amber/10"
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
