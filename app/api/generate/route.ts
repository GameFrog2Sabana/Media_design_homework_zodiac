import { NextResponse } from "next/server";
import { buildFallback } from "@/lib/fallback";
import type {
  GenerationRecord,
  GenerationResponse,
  GenerationSource,
} from "@/lib/types";
import {
  coerceConstellationResult,
  parseGenerateRequest,
  ValidationError,
} from "@/lib/validation";
import {
  chooseVariant,
  creativityConfig,
} from "@/lib/server/creativity";
import {
  isLLMConfigured,
  requestConstellationJson,
} from "@/lib/server/llm";
import { buildPrompt } from "@/lib/server/prompt";
import { allowGeneration } from "@/lib/server/rate-limit";
import {
  recordGeneration,
  withStorageTimeout,
} from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 64 * 1024) {
    return jsonError("リクエストが大きすぎます。", 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("JSONを読み取れませんでした。", 400);
  }

  let input;
  try {
    input = parseGenerateRequest(body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("入力を確認してください。", 400);
  }

  if (!allowGeneration(input.sessionId)) {
    return jsonError(
      "短時間に生成が集中しています。少し待ってからお試しください。",
      429,
    );
  }

  const startedAt = Date.now();
  const variant = chooseVariant(input.sessionId);
  const id = crypto.randomUUID();
  let source: GenerationSource = "fallback";
  let model = "local-fallback";
  let result = buildFallback({
    stars: input.stars,
    sketchEdges: input.edges,
    aspect: input.aspect,
    theme: input.theme,
    attempt: input.attempt,
  });

  if (isLLMConfigured()) {
    try {
      const messages = buildPrompt(
        {
          stars: input.stars,
          sketchEdges: input.edges,
          aspect: input.aspect,
          theme: input.theme,
        },
        variant,
        creativityConfig.guardrails,
      );
      const completion = await requestConstellationJson(
        messages,
        variant.temperature,
      );
      const outcome = coerceConstellationResult(completion.data, {
        stars: input.stars,
        sketchEdges: input.edges,
        aspect: input.aspect,
        theme: input.theme,
        attempt: input.attempt,
      });
      result = outcome.result;
      source = "llm";
      model = completion.model;
      if (outcome.repaired) {
        console.info(
          "Constellation result repaired:",
          outcome.rejectedFields.join(", "),
        );
      }
    } catch (error) {
      console.error(
        "Constellation LLM failed, using local fallback:",
        error instanceof Error ? error.message : error,
      );
      source = "fallback";
      model = "local-fallback";
      result = buildFallback({
        stars: input.stars,
        sketchEdges: input.edges,
        aspect: input.aspect,
        theme: input.theme,
        attempt: input.attempt,
      });
    }
  }

  const latencyMs = Math.max(0, Date.now() - startedAt);
  const createdAt = new Date().toISOString();

  if (input.consent) {
    const record: GenerationRecord = {
      id,
      sessionId: input.sessionId,
      createdAt,
      variant: variant.id,
      configVersion: creativityConfig.version,
      stars: input.stars,
      edges: input.edges,
      aspect: input.aspect,
      theme: input.theme,
      attempt: input.attempt,
      result,
      source,
      model,
      latencyMs,
    };

    try {
      const stored = await withStorageTimeout(
        recordGeneration(record).catch((error) => {
          console.error("Failed to store generation:", error);
          return false;
        }),
      );
      if (stored === false) {
        console.warn("Generation was not stored (no durable storage?).");
      }
    } catch (error) {
      console.error("Storage timeout:", error);
    }
  }

  const response: GenerationResponse = {
    id,
    result,
    source,
    model,
    variant: variant.id,
    configVersion: creativityConfig.version,
    latencyMs,
    createdAt,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
