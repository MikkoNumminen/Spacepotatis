import { ImageResponse } from "next/og";

// Static at build time — deterministic SVG, no per-request input. Apple
// touch-icon requests would otherwise re-run the ImageResponse on every
// hit from an iOS device adding the bookmark, etc.
export const dynamic = "force-static";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
            "radial-gradient(circle at 50% 45%, #1a1043 0%, #05030f 100%)"
        }}
      >
        <svg width="160" height="160" viewBox="0 0 64 64">
          <defs>
            <radialGradient id="p" cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#e8c089" />
              <stop offset="60%" stopColor="#c08850" />
              <stop offset="100%" stopColor="#7a4f24" />
            </radialGradient>
          </defs>
          <g transform="rotate(-12 32 34)">
            <path
              d="M 32 8 C 48 8 56 20 55 34 C 54 48 46 60 32 60 C 18 60 10 48 9 34 C 8 20 16 8 32 8 Z"
              fill="url(#p)"
              stroke="#5a3a18"
              strokeWidth="1"
            />
            <ellipse cx="22" cy="20" rx="7" ry="11" fill="#f0d4a0" opacity="0.45" />
            <circle cx="20" cy="34" r="2" fill="#3d2410" />
            <circle cx="36" cy="24" r="1.6" fill="#3d2410" />
            <circle cx="42" cy="42" r="1.8" fill="#3d2410" />
            <circle cx="26" cy="48" r="1.6" fill="#3d2410" />
            <circle cx="46" cy="32" r="1.2" fill="#3d2410" />
            <path
              d="M 26 9 q 2 -6 5 -2 q 3 -4 5 2"
              stroke="#5aa83a"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <ellipse cx="30" cy="6" rx="2" ry="1.2" fill="#7ed064" />
          </g>
        </svg>
      </div>
    ),
    { ...size }
  );
}
