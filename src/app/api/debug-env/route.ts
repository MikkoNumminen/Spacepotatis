import { NextResponse } from "next/server";

// Temporary diagnostic — returns presence/length of each auth env var so we
// can confirm Vercel actually injects them into the runtime function. Never
// returns the values themselves. Delete this route once auth is working.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function describe(name: string): { present: boolean; length: number } {
  const v = process.env[name];
  return { present: typeof v === "string" && v.length > 0, length: v?.length ?? 0 };
}

export function GET(): Response {
  return NextResponse.json({
    AUTH_SECRET: describe("AUTH_SECRET"),
    AUTH_URL: describe("AUTH_URL"),
    AUTH_GOOGLE_ID: describe("AUTH_GOOGLE_ID"),
    AUTH_GOOGLE_SECRET: describe("AUTH_GOOGLE_SECRET"),
    DATABASE_URL: describe("DATABASE_URL"),
    DATABASE_URL_UNPOOLED: describe("DATABASE_URL_UNPOOLED"),
    VERCEL_URL: describe("VERCEL_URL"),
    NODE_ENV: process.env.NODE_ENV ?? "unknown"
  });
}
