"use client";

import LoadoutMenu from "@/components/LoadoutMenu";

export default function LoadoutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-[28rem] max-w-[92vw]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-full top-0 mr-3 rounded border border-hud-amber/40 px-3 py-1 text-sm text-hud-amber hover:bg-hud-amber/10"
        >
          Back
        </button>
        <LoadoutMenu mode="equip" />
      </div>
    </div>
  );
}
