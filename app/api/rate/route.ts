import { NextResponse } from "next/server";
import { parseRateRequest, ValidationError } from "@/lib/validation";
import { recordRating, withStorageTimeout } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSONを読み取れませんでした。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let input;
  try {
    input = parseRateRequest(body);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ValidationError
            ? error.message
            : "入力を確認してください。",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const saved = await withStorageTimeout(
      recordRating({
        generationId: input.generationId,
        sessionId: input.sessionId,
        score: input.score,
        createdAt: new Date().toISOString(),
      }).catch((error) => {
        console.error("Failed to store rating:", error);
        return false;
      }),
    );

    if (saved === false) {
      return NextResponse.json(
        { error: "評価を保存できませんでした。" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Rating storage failed:", error);
    return NextResponse.json(
      { error: "評価を保存できませんでした。" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
