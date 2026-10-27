import type { ChatMessage } from "./prompt";

export class LLMError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "LLMError";
    this.status = status;
  }
}

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-3.6-flash";
const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash";
const GEMINI_HOST = "generativelanguage.googleapis.com";

export type LLMApiStyle = "gemini" | "openai";

export interface LLMCompletion {
  data: unknown;
  model: string;
}

export function getLLMBaseUrl(): string {
  return (process.env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
}

export function getLLMModel(): string {
  return (process.env.LLM_MODEL?.trim() || DEFAULT_MODEL).replace(
    /^models\//,
    "",
  );
}

/**
 * Primary model followed by optional fallbacks for transient overload
 * (503/429). Set LLM_FALLBACK_MODELS to a comma-separated list, or to an
 * empty string to disable model fallback.
 */
export function getLLMModels(): string[] {
  const rawFallbacks = process.env.LLM_FALLBACK_MODELS;
  const fallbacks = (
    rawFallbacks === undefined ? DEFAULT_FALLBACK_MODEL : rawFallbacks
  )
    .split(",")
    .map((model) => model.trim().replace(/^models\//, ""))
    .filter(Boolean);

  return [...new Set([getLLMModel(), ...fallbacks])];
}

export function isLLMConfigured(): boolean {
  return Boolean(
    (process.env.LLM_API_KEY || process.env.GEMINI_API_KEY)?.trim(),
  );
}

/**
 * Gemini 3 models are served by the Interactions API. OpenAI-compatible
 * servers keep using /chat/completions. We infer the style from the base URL
 * so existing deployments that still point at /openai keep working, and allow
 * LLM_API_STYLE=gemini|openai to override the guess.
 */
export function getLLMApiStyle(): LLMApiStyle {
  const explicit = process.env.LLM_API_STYLE?.trim().toLowerCase();
  if (explicit === "gemini" || explicit === "openai") return explicit;

  const base = getLLMBaseUrl();
  if (base.includes(GEMINI_HOST) && !/\/openai(?:\/|$)/.test(base)) {
    return "gemini";
  }
  return "openai";
}

function getAPIKey(): string {
  const key = (process.env.LLM_API_KEY || process.env.GEMINI_API_KEY)?.trim();
  if (!key) {
    throw new LLMError("LLM_API_KEY is not configured.");
  }
  return key;
}

function geminiEndpoint(): string {
  const base = getLLMBaseUrl().replace(/\/openai$/, "");
  return base.endsWith("/interactions") ? base : `${base}/interactions`;
}

function openAIEndpoint(): string {
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

interface InteractionStep {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
}

interface InteractionResponse {
  status?: string;
  output_text?: string;
  steps?: InteractionStep[];
  error?: { message?: string; code?: string };
}

function getChatMessageContent(response: ChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  return "";
}

function getInteractionText(response: InteractionResponse): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  return (response.steps ?? [])
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter(
      (part) => part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text as string)
    .join("");
}

async function postJSON(
  endpoint: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = 24_000,
): Promise<{ response: Response; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    return { response, text: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
}

function errorDetail(text: string, fallback: string): string {
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string };
    };
    return parsed.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function requestGeminiJson(
  messages: ChatMessage[],
  temperature: number,
): Promise<LLMCompletion> {
  const systemInstruction = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const input = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n\n");

  const body: Record<string, unknown> = {
    input,
    // This is a one-shot generation; no need to retain it on Google's side.
    store: false,
    generation_config: {
      temperature,
      max_output_tokens: 3072,
    },
    response_format: {
      type: "text",
      mime_type: "application/json",
    },
  };
  if (systemInstruction) body.system_instruction = systemInstruction;

  const endpoint = geminiEndpoint();
  const models = getLLMModels();

  // Gemini occasionally answers 503/429 while a model is briefly overloaded.
  // Fall through to the next configured model when the failure came back
  // quickly enough that the next attempt still fits the route budget.
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const startedAt = Date.now();
    const { response, text } = await postJSON(
      endpoint,
      { "x-goog-api-key": getAPIKey() },
      { ...body, model },
    );

    if (!response.ok) {
      const retryable = response.status === 503 || response.status === 429;
      const hasFallback = index < models.length - 1;
      if (
        retryable &&
        hasFallback &&
        Date.now() - startedAt <= 8_000
      ) {
        continue;
      }
      throw new LLMError(
        `LLM request failed (${response.status}): ${errorDetail(
          text,
          text.slice(0, 400),
        )}`,
        response.status,
      );
    }

    let payload: InteractionResponse;
    try {
      payload = JSON.parse(text) as InteractionResponse;
    } catch {
      throw new LLMError("LLM response was not valid JSON.");
    }

    const content = getInteractionText(payload);
    if (!content) {
      const reason =
        payload.status === "incomplete"
          ? "LLM response was incomplete."
          : "LLM returned an empty message.";
      throw new LLMError(reason);
    }

    return { data: extractJsonObject(content), model };
  }

  throw new LLMError("No LLM model was configured.");
}

async function requestOpenAIJson(
  messages: ChatMessage[],
  temperature: number,
): Promise<LLMCompletion> {
  const send = async (useResponseFormat: boolean) => {
    const body: Record<string, unknown> = {
      model: getLLMModel(),
      messages,
      temperature,
      max_tokens: 2600,
      stream: false,
    };
    if (useResponseFormat) {
      body.response_format = { type: "json_object" };
    }

    return postJSON(
      openAIEndpoint(),
      { Authorization: `Bearer ${getAPIKey()}` },
      body,
    );
  };

  let { response, text } = await send(true);

  if (
    !response.ok &&
    response.status === 400 &&
    /response_format|json_object/i.test(text)
  ) {
    ({ response, text } = await send(false));
  }

  if (!response.ok) {
    throw new LLMError(
      `LLM request failed (${response.status}): ${errorDetail(
        text,
        text.slice(0, 400),
      )}`,
      response.status,
    );
  }

  let payload: ChatCompletionResponse;
  try {
    payload = JSON.parse(text) as ChatCompletionResponse;
  } catch {
    throw new LLMError("LLM response was not valid JSON.");
  }

  const content = getChatMessageContent(payload);
  if (!content) {
    throw new LLMError("LLM returned an empty message.");
  }

  return {
    data: extractJsonObject(content),
    model: getLLMModel(),
  };
}

/**
 * Ask the configured provider for one JSON object. Gemini uses the
 * Interactions API; OpenAI-compatible endpoints keep /chat/completions.
 */
export async function requestConstellationJson(
  messages: ChatMessage[],
  temperature: number,
): Promise<LLMCompletion> {
  return getLLMApiStyle() === "gemini"
    ? requestGeminiJson(messages, temperature)
    : requestOpenAIJson(messages, temperature);
}
