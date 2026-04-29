"use client";

export interface SplashStep {
  readonly label: string;
  readonly done: boolean;
}

export default function Splash({ steps }: { steps: ReadonlyArray<SplashStep> }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-space-bg/70 p-4 backdrop-blur-sm">
      <div className="select-none rounded border border-hud-green/40 bg-space-bg/80 p-5 shadow-[0_0_30px_rgba(94,255,167,0.15)] sm:p-6">
        <div className="font-display text-2xl tracking-widest text-hud-green animate-pulse sm:text-3xl">
          SPACEPOTATIS
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-hud-amber/70">
          system boot
        </div>

        <ul className="mt-5 flex flex-col gap-1 font-mono text-sm">
          {steps.map((s) => (
            <li key={s.label} className="flex items-baseline gap-2">
              <span className={s.done ? "text-hud-green" : "text-hud-amber/60"}>
                {s.done ? "✓" : "◌"}
              </span>
              <span className={s.done ? "text-hud-green" : "text-hud-amber/60"}>
                {s.label}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 font-mono text-sm text-hud-green">
          &gt;<span className="splash-cursor">_</span>
        </div>
      </div>

      <style>{`
        @keyframes splashCursorBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .splash-cursor {
          display: inline-block;
          margin-left: 4px;
          animation: splashCursorBlink 1s steps(1, end) infinite;
        }
      `}</style>
    </div>
  );
}
