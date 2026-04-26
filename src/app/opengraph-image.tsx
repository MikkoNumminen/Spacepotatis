import { ImageResponse } from "next/og";

// Bake the OG card at build time. The image is fully deterministic — no
// per-request data — so we want exactly one ImageResponse render in CI
// instead of one per scraper hit (Slack, Twitter, Discord, Google preview,
// link-unfurlers, etc.) burning serverless function invocations forever.
export const dynamic = "force-static";
export const alt = "Spacepotatis — a vertical scrolling space shooter starring a potato";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(ellipse at 50% 50%, #2a1860 0%, #0a0530 55%, #03020a 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
          position: "relative"
        }}
      >
        <div style={{ position: "absolute", inset: 0, display: "flex" }}>
          {Array.from({ length: 80 }).map((_, i) => {
            const x = (i * 137) % 1200;
            const y = (i * 211) % 630;
            const r = (i % 5) * 0.6 + 0.6;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: r,
                  height: r,
                  borderRadius: "50%",
                  background: i % 7 === 0 ? "#ffd6a9" : "#ffffff",
                  opacity: 0.6 + (i % 4) * 0.1
                }}
              />
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 70,
            position: "relative"
          }}
        >
          <svg width="430" height="430" viewBox="0 0 64 64">
            <defs>
              <radialGradient id="potatoOg" cx="40%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#f4d199" />
                <stop offset="60%" stopColor="#c08850" />
                <stop offset="100%" stopColor="#6e431c" />
              </radialGradient>
            </defs>
            <g transform="rotate(-12 32 34)">
              <path
                d="M 32 8 C 48 8 56 20 55 34 C 54 48 46 60 32 60 C 18 60 10 48 9 34 C 8 20 16 8 32 8 Z"
                fill="url(#potatoOg)"
                stroke="#4a2e10"
                strokeWidth="1.2"
              />
              <ellipse cx="22" cy="20" rx="7" ry="11" fill="#f8dfb0" opacity="0.5" />
              <circle cx="20" cy="34" r="2.2" fill="#3d2410" />
              <circle cx="36" cy="24" r="1.7" fill="#3d2410" />
              <circle cx="42" cy="42" r="2" fill="#3d2410" />
              <circle cx="26" cy="48" r="1.8" fill="#3d2410" />
              <circle cx="46" cy="32" r="1.3" fill="#3d2410" />
              <path
                d="M 26 9 q 2 -6 5 -2 q 3 -4 5 2"
                stroke="#5aa83a"
                strokeWidth="2.4"
                fill="none"
                strokeLinecap="round"
              />
              <ellipse cx="30" cy="6" rx="2.2" ry="1.4" fill="#7ed064" />
            </g>
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 130,
                fontWeight: 800,
                letterSpacing: -3,
                lineHeight: 1
              }}
            >
              Spacepotatis
            </div>
            <div
              style={{
                fontSize: 36,
                color: "#9cb4ff",
                marginTop: 18,
                maxWidth: 520,
                lineHeight: 1.2
              }}
            >
              Vertical-scrolling space shooter with a 3D galaxy overworld.
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
