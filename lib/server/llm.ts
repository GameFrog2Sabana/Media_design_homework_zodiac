import type { ChatMessage } from "./prompt";

export class LLMError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "LLMError";
    this.status = status;
  }
}

export function getLLMBaseUrl(): string {
  return (
    process.env.LLM_BASE_URL?.trim() ||
    "https://generativelanguage.googleapis.com/v1beta/openai"
  ).replace(/\/+$/, "");
}

export function getLLMModel(): string {
  return process.env.LLM_MODEL?.trim() || "gemini-2.5-flash";
}

export function isLLMConfigured(): boolean {
  return Boolean(
    (process.env.LLM_API_KEY || process.env.GEMINI_API_KEY)?.trim(),
  );
}

function getAPIKey(): string {
  const key = (process.env.LLM_API_KEY || process.env.GEMINI_API_KEY)?.trim();
  if (!key) {
    throw new LLMError("LLM_API_KEY is not configured.");
  }
  return key;
}

function completionEndpoint(): string {
  const base = getLLMBaseUrl();
  return base.endsWith("/chat/completions")
    ? base
    : `${base}/chat/completions`;
}

export function extractJsonObject(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  if (start < 0) throw new LLMError("Model did not return a JSON object.");

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(start, i + 1));
      }
    }
  }

  throw new LLMError("Model returned an incomplete JSON object.");
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string };
}

function getMessageContent(response: ChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  return "";
}

async function postChat(
  messages: ChatMessage[],
  temperature: number,
  useResponseFormat: boolean,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 24_000);

  try {
    const body: Record<string, unknown> = {
      model: getLLMModel(),
      messages,
      temperature,
      max_tokens: 1100,
      stream: false,
    };
    if (useResponseFormat) {
      body.response_format = { type: "json_object" };
    }

    return await fetch(completionEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAPIKey()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Ask the configured OpenAI-compatible chat endpoint for one JSON object.
 * Gemini's OpenAI-compatible endpoint is the default; OpenRouter, OpenAI and
 * local servers work with the same environment variables.
 */
export async function requestConstellationJson(
  messages: ChatMessage[],
  temperature: number,
): Promise<unknown> {
  let response = await postChat(messages, temperature, true);
  let responseText = await response.text();

  if (
    !response.ok &&
    response.status === 400 &&
    /response_format|json_object/i.test(responseText)
  ) {
    response = await postChat(messages, temperature, false);
    responseText = await response.text();
  }

  if (!response.ok) {
    let detail = responseText.slice(0, 400);
    try {
      const parsed = JSON.parse(responseText) as ChatCompletionResponse;
      detail = parsed.error?.message ?? detail;
    } catch {
      // Keep the raw detail.
    }
    throw new LLMError(
      `LLM request failed (${response.status}): ${detail}`,
      response.status,
    );
  }

  let payload: ChatCompletionResponse;
  try {
    payload = JSON.parse(responseText) as ChatCompletionResponse;
  } catch {
    throw new LLMError("LLM response was not valid JSON.");
  }

  const content = getMessageContent(payload);
  if (!content) {
    throw new LLMError("LLM returned an empty message.");
  }

  return extractJsonObject(content);
}
