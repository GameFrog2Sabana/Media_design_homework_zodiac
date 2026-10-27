import { afterEach, describe, expect, it } from "vitest";
import {
  extractJsonObject,
  getLLMApiStyle,
  getLLMBaseUrl,
  getLLMModel,
  getLLMModels,
} from "./llm";

const ENV_KEYS = [
  "LLM_MODEL",
  "LLM_FALLBACK_MODELS",
  "LLM_BASE_URL",
  "LLM_API_STYLE",
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("LLM configuration", () => {
  it("uses the Interactions API and a fallback model by default", () => {
    for (const key of ENV_KEYS) delete process.env[key];

    expect(getLLMBaseUrl()).toBe(
      "https://generativelanguage.googleapis.com/v1beta",
    );
    expect(getLLMModel()).toBe("gemini-3.6-flash");
    expect(getLLMModels()).toEqual([
      "gemini-3.6-flash",
      "gemini-3.5-flash",
    ]);
    expect(getLLMApiStyle()).toBe("gemini");
  });

  it("normalizes model names and removes duplicates", () => {
    process.env.LLM_MODEL = "models/gemini-3.8-flash";
    process.env.LLM_FALLBACK_MODELS =
      "gemini-3.7-flash, models/gemini-3.8-flash, gemini-3.5-flash";

    expect(getLLMModel()).toBe("gemini-3.8-flash");
    expect(getLLMModels()).toEqual([
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.5-flash",
    ]);
  });

  it("allows model fallback to be disabled with an empty value", () => {
    process.env.LLM_MODEL = "gemini-3.6-flash";
    process.env.LLM_FALLBACK_MODELS = "";

    expect(getLLMModels()).toEqual(["gemini-3.6-flash"]);
  });

  it("detects OpenAI-compatible endpoints and honors an explicit style", () => {
    delete process.env.LLM_API_STYLE;
    process.env.LLM_BASE_URL =
      "https://generativelanguage.googleapis.com/v1beta/openai";

    expect(getLLMApiStyle()).toBe("openai");

    process.env.LLM_API_STYLE = "gemini";

    expect(getLLMApiStyle()).toBe("gemini");
  });
});

describe("extractJsonObject", () => {
  it("extracts a fenced JSON object with braces inside strings", () => {
    expect(
      extractJsonObject(
        '```json\n{"name":"灯台座","story":"灯を {ともす} 夜"}\n```',
      ),
    ).toEqual({ name: "灯台座", story: "灯を {ともす} 夜" });
  });

  it("rejects a response without a JSON object", () => {
    expect(() => extractJsonObject("星座を編みました。")).toThrow(
      /JSON object/,
    );
  });
});
