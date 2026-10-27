import { NextResponse } from "next/server";
import { creativityConfig } from "@/lib/server/creativity";
import { isLLMConfigured, getLLMModel } from "@/lib/server/llm";
import { getStorageKind } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      storage: getStorageKind(),
      llm: isLLMConfigured(),
      model: isLLMConfigured() ? getLLMModel() : "local-fallback",
      configVersion: creativityConfig.version,
      updatedAt: creativityConfig.updatedAt,
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
