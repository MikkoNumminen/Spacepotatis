"use client";

import { useEffect, useState } from "react";
import type { CombatSummary } from "@/game/phaser/config";
import { itemSfx } from "@/game/audio/itemSfx";
import { describeMissionReward } from "@/game/state/rewards";

// Server-sync outcome surfaced under the stats. GameCanvas drives this from
// the awaited results of saveNow() / submitScore(). The states map to four
// player-facing situations:
//  - idle: a loss, or modal opened from a pure replay — nothing to surface.
//  - pending: save/score in flight; modal mounts before they resolve.
//  - ok: both saved AND posted. Player gets a tiny green confirmation.
//  - unauthenticated: not signed in. Hint that scores aren't being saved.
//  - save_failed / score_failed: server rejected. Includes the humanized
//    message (e.g. "Score rejected — server doesn't see this mission as
//    completed yet. Try saving again.") so the player has a breadcrumb.
export type VictorySyncStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "pending" }
  | { readonly kind: "ok" }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "save_failed"; readonly status: number; readonly message: string }
  | { readonly kind: "score_failed"; readonly status: number; readonly message: string };

export default function VictoryModal({
  summary,
  missionName,
  syncStatus = { kind: "idle" },
  onClose
}: {
  summary: CombatSummary;
  missionName: string;
  syncStatus?: VictorySyncStatus;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  // First-clear reward voice cue — fires once on modal mount, matched to
  // the reward kind. Replays show no reward so this branch is skipped.
  const reward = summary.firstClearReward;
  useEffect(() => {
    if (!reward) return;
    switch (reward.kind) {
      case "weapon":
        itemSfx.weapon();
        return;
      case "augment":
        itemSfx.augment();
        return;
      case "upgrade":
        itemSfx.upgrade();
        return;
      case "credits":
        itemSfx.money();
        return;
    }
  }, [reward]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const victory = summary.victory;
  const titleText = victory ? "MISSION COMPLETE" : "MISSION FAILED";
  const buttonText = victory ? "CONTINUE" : "RETURN";
  const titleColor = victory ? "text-hud-green" : "text-hud-red";
  const panelBorder = victory ? "border-hud-green/40" : "border-hud-red/40";
  const buttonClass = victory
    ? "border-hud-green/60 text-hud-green hover:bg-hud-green/10 active:bg-hud-green/20"
    : "border-hud-red/60 text-hud-red hover:bg-hud-red/10 active:bg-hud-red/20";

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-space-bg/70 p-3 backdrop-blur-sm sm:p-6">
      <div
        className={`w-[min(28rem,100%)] rounded border ${panelBorder} bg-space-panel/95 p-5 shadow-[0_0_40px_rgba(94,255,167,0.15)] transition-all duration-200 ease-out sm:p-8 ${
          ready ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        <div className="flex flex-col items-center select-none">
          <div className={`font-display text-2xl tracking-widest sm:text-3xl ${titleColor}`}>
            {titleText}
          </div>
          <div className="mt-2 text-xs uppercase tracking-[0.3em] text-hud-amber/80">
            ─── {missionName} ───
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 font-mono text-sm">
          <StatRow label="SCORE" value={summary.score.toLocaleString()} valueClass="text-hud-green" />
          <StatRow
            label="CREDITS"
            value={`¢ ${summary.credits.toLocaleString()}`}
            valueClass="text-hud-amber"
          />
          <StatRow label="TIME" value={formatTime(summary.timeSeconds)} valueClass="text-hud-green" />
        </div>

        {summary.firstClearReward && (
          <div className="mt-6">
            <div className="text-center font-display text-xs tracking-widest text-hud-amber">
              ─── ITEMS RECEIVED ───
            </div>
            <div className="mt-3 flex flex-col items-center gap-1">
              <div className="text-hud-amber font-mono text-sm">⭐ FIRST CLEAR</div>
              <div className="text-hud-green font-mono text-sm">
                {describeMissionReward(summary.firstClearReward)}
              </div>
            </div>
          </div>
        )}

        <SyncStatusLine status={syncStatus} />

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className={`touch-manipulation select-none rounded border ${buttonClass} px-6 py-2 font-display tracking-widest`}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  valueClass
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 sm:gap-12">
      <span className="text-hud-green/70">{label}</span>
      <span className={`text-right ${valueClass}`}>{value}</span>
    </div>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function SyncStatusLine({ status }: { status: VictorySyncStatus }): React.ReactNode {
  if (status.kind === "idle") return null;
  if (status.kind === "pending") {
    return (
      <div className="mt-6 text-center text-xs text-space-border">
        Saving and posting score…
      </div>
    );
  }
  if (status.kind === "ok") {
    return (
      <div className="mt-6 text-center text-xs text-hud-green/80">
        ✓ Score posted to leaderboard
      </div>
    );
  }
  if (status.kind === "unauthenticated") {
    return (
      <div className="mt-6 rounded border border-hud-amber/40 bg-hud-amber/5 px-3 py-2 text-center text-xs text-hud-amber/90">
        Sign in on the home page to save your progress and post scores to the leaderboard.
      </div>
    );
  }
  // save_failed | score_failed
  return (
    <div className="mt-6 rounded border border-hud-red/40 bg-hud-red/5 px-3 py-2 text-center text-xs text-hud-red/90">
      ⚠ {status.message}
    </div>
  );
}
