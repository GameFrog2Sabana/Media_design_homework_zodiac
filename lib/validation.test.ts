import { describe, expect, it } from "vitest";
import {
  coerceConstellationResult,
  ensureConstellationSuffix,
  isAcceptableName,
  isKanaReading,
  parseGenerateRequest,
  parseRateRequest,
  ValidationError,
} from "@/lib/validation";
import { sameEdgeSet } from "@/lib/edges";
import type { ApiGenerateRequest } from "@/lib/types";

const stars = [
  { x: 0.2, y: 0.3 },
  { x: 0.5, y: 0.2 },
  { x: 0.8, y: 0.55 },
  { x: 0.45, y: 0.75 },
];

function validBody(overrides: Partial<ApiGenerateRequest> = {}) {
  return {
    sessionId: "anon_1234abcd",
    consent: true,
    stars,
    edges: [[0, 1]],
    aspect: 1.6,
    theme: "灯台",
    attempt: 1,
    ...overrides,
  };
}

function manyStars(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    x: 0.06 + (index % 4) * 0.29,
    y: 0.06 + Math.floor(index / 4) * 0.29,
  }));
}

function manyEdges(starCount: number, count: number): [number, number][] {
  const edges: [number, number][] = [];
  for (let a = 0; a < starCount && edges.length < count; a += 1) {
    for (let b = a + 1; b < starCount && edges.length < count; b += 1) {
      edges.push([a, b]);
    }
  }
  return edges;
}

describe("parseGenerateRequest", () => {
  it("accepts a well formed request and normalizes edges", () => {
    const parsed = parseGenerateRequest(
      validBody({ edges: [[1, 0], [1, 0], [2, 3]] }),
    );
    expect(parsed.sessionId).toBe("anon_1234abcd");
    expect(parsed.edges).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(parsed.aspect).toBe(1.6);
    expect(parsed.theme).toBe("灯台");
  });

  it("rejects too few stars", () => {
    expect(() =>
      parseGenerateRequest(validBody({ stars: stars.slice(0, 2) })),
    ).toThrow(ValidationError);
  });

  it("rejects an invalid session id", () => {
    expect(() =>
      parseGenerateRequest(validBody({ sessionId: "short" })),
    ).toThrow(ValidationError);
  });

  it("requires explicit research consent", () => {
    expect(() =>
      parseGenerateRequest({ ...validBody(), consent: false }),
    ).toThrow(ValidationError);
  });

  it("clamps theme and strips markup characters", () => {
    const parsed = parseGenerateRequest(
      validBody({ theme: "<script>夜</script>" }),
    );
    expect(parsed.theme).not.toContain("<");
    expect(Array.from(parsed.theme).length).toBeLessThanOrEqual(60);
  });

  it("passes the user's star coordinates through unchanged", () => {
    const placed = manyStars(16);
    const parsed = parseGenerateRequest(
      validBody({ stars: placed, edges: manyEdges(16, 60) }),
    );
    expect(parsed.stars).toEqual(placed);
    expect(parsed.edges).toHaveLength(60);
  });

  it("rejects the 61st line instead of silently dropping it", () => {
    expect(() =>
      parseGenerateRequest(
        validBody({ stars: manyStars(16), edges: manyEdges(16, 61) }),
      ),
    ).toThrow(ValidationError);
  });
});

describe("parseRateRequest", () => {
  it("accepts a score between 1 and 5", () => {
    const parsed = parseRateRequest({
      generationId: "123e4567-e89b-12d3-a456-426614174000",
      sessionId: "anon_1234abcd",
      score: 4,
    });
    expect(parsed.score).toBe(4);
  });

  it("rejects an out of range score", () => {
    expect(() =>
      parseRateRequest({
        generationId: "123e4567-e89b-12d3-a456-426614174000",
        sessionId: "anon_1234abcd",
        score: 6,
      }),
    ).toThrow(ValidationError);
  });
});

describe("name and reading checks", () => {
  it("requires the 座 suffix and rejects real constellations", () => {
    expect(isAcceptableName("オリオン")).toBe(false);
    expect(isAcceptableName("オリオン座")).toBe(false);
    expect(isAcceptableName("灯守りの鯨")).toBe(false);
    expect(isAcceptableName("灯守りの鯨座")).toBe(true);
    expect(ensureConstellationSuffix("灯守りの鯨")).toBe("灯守りの鯨座");
    expect(ensureConstellationSuffix("灯守りの鯨座")).toBe("灯守りの鯨座");
  });

  it("requires kana readings", () => {
    expect(isKanaReading("ひもり")).toBe(true);
    expect(isKanaReading("灯守り")).toBe(false);
  });
});

describe("coerceConstellationResult", () => {
  const context = {
    stars,
    sketchEdges: [[0, 1]] as [number, number][],
    aspect: 1.6,
    theme: "灯台",
    attempt: 1,
  };

  function validModel(figureEdges: [number, number][]) {
    return {
      name: "灯守りの鯨座",
      reading: "ひもりのくじらざ",
      motif: "whale",
      paletteId: "tide",
      epithet: "夜を渡る星座",
      story:
        "遠い海の向こうで、若い鯨が灯りをともしていた。星をたどる者だけが、その帰り道を知っているという。",
      figureEdges,
      keywords: ["灯", "海", "帰り"],
      formReading:
        "横に広がる星々が、左上から右下へ緩やかな鎖を描いている。",
    };
  }

  it("keeps a valid model result", () => {
    const outcome = coerceConstellationResult(
      {
        name: "灯守りの鯨座",
        reading: "ひもりのくじらざ",
        motif: "whale",
        paletteId: "tide",
        epithet: "夜を渡る星座",
        story:
          "遠い海の向こうで、若い鯨が灯りをともしていた。星をたどる者だけが、その帰り道を知っているという。",
        figureEdges: [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
        ],
        keywords: ["灯", "海", "帰り"],
        formReading:
          "横に広がる星々が、左上から右下へ緩やかな鎖を描いている。",
      },
      context,
    );

    expect(outcome.result.name).toBe("灯守りの鯨座");
    expect(outcome.result.motif).toBe("whale");
    expect(outcome.repaired).toBe(false);
    // The user's one drawn line wins over the model's four suggested lines.
    expect(outcome.result.figureEdges).toEqual([[0, 1]]);
  });

  it("keeps a ring, a branch and a separate part exactly as drawn", () => {
    const drawnStars = manyStars(9);
    const drawn: [number, number][] = [
      [1, 0],
      [1, 2],
      [2, 0],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 3],
      [6, 7],
    ];
    const outcome = coerceConstellationResult(validModel([[0, 1], [1, 2]]), {
      stars: drawnStars,
      sketchEdges: drawn,
      aspect: 1.6,
      theme: "灯台",
      attempt: 1,
    });

    expect(outcome.result.figureEdges).toEqual([
      [0, 1],
      [1, 2],
      [0, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [3, 5],
      [6, 7],
    ]);
    expect(outcome.result.figureEdges).toHaveLength(drawn.length);
  });

  it("keeps all 60 drawn segments and does not mutate the input", () => {
    const drawnStars = manyStars(16);
    const drawn = manyEdges(16, 60).map(
      ([a, b], index): [number, number] => (index % 2 === 0 ? [b, a] : [a, b]),
    );
    const starsSnapshot = structuredClone(drawnStars);
    const edgesSnapshot = structuredClone(drawn);

    const outcome = coerceConstellationResult(validModel([[0, 1]]), {
      stars: drawnStars,
      sketchEdges: drawn,
      aspect: 1.6,
      theme: "灯台",
      attempt: 1,
    });

    expect(outcome.result.figureEdges).toHaveLength(60);
    expect(sameEdgeSet(outcome.result.figureEdges, drawn)).toBe(true);
    expect(drawnStars).toEqual(starsSnapshot);
    expect(drawn).toEqual(edgesSnapshot);
  });

  it("never truncates a sketch inside the generator", () => {
    const drawnStars = manyStars(16);
    const drawn = manyEdges(16, 61);
    const outcome = coerceConstellationResult(validModel([[0, 1]]), {
      stars: drawnStars,
      sketchEdges: drawn,
      aspect: 1.6,
      theme: "灯台",
      attempt: 1,
    });

    expect(outcome.result.figureEdges).toHaveLength(61);
    expect(sameEdgeSet(outcome.result.figureEdges, drawn)).toBe(true);
  });

  it("fills the shape reading from the drawing when the model omits it", () => {
    const outcome = coerceConstellationResult(
      {
        name: "灯守りの鯨座",
        reading: "ひもりのくじらざ",
        motif: "whale",
        paletteId: "tide",
        epithet: "夜を渡る星座",
        story:
          "遠い海の向こうで、若い鯨が灯りをともしていた。星をたどる者だけが、その帰り道を知っているという。",
        figureEdges: [[0, 1]],
        keywords: ["灯", "海", "帰り"],
      },
      context,
    );

    expect(outcome.rejectedFields).toContain("formReading");
    expect(outcome.result.formReading).toContain("全体は");
    expect(outcome.result.formReading).toContain("横長");
  });

  it("softly corrects a motif that clearly contradicts the silhouette", () => {
    const outcome = coerceConstellationResult(
      {
        name: "灯守りの船座",
        reading: "ひもりのふねざ",
        motif: "ship",
        paletteId: "tide",
        epithet: "夜を渡る星座",
        story:
          "遠い海の向こうで、小さな船が灯りをともしていた。星をたどる者だけが、その帰り道を知っているという。",
        figureEdges: [[0, 1]],
        keywords: ["灯", "海", "帰り"],
        formReading:
          "横に広がる星々が、左上から右下へ緩やかな鎖を描いている。",
      },
      context,
    );

    expect(["whale", "bird", "dragon"]).toContain(outcome.result.motif);
    expect(outcome.result.motif).not.toBe("ship");
    expect(outcome.rejectedFields).toContain("motifShape");
  });

  it("keeps a motif that already suits the silhouette", () => {
    const outcome = coerceConstellationResult(
      {
        name: "灯守りの鯨座",
        reading: "ひもりのくじらざ",
        motif: "whale",
        paletteId: "tide",
        epithet: "夜を渡る星座",
        story:
          "遠い海の向こうで、若い鯨が灯りをともしていた。星をたどる者だけが、その帰り道を知っているという。",
        figureEdges: [[0, 1]],
        keywords: ["灯", "海", "帰り"],
        formReading:
          "横に広がる星々が、左上から右下へ緩やかな鎖を描いている。",
      },
      context,
    );

    expect(outcome.result.motif).toBe("whale");
    expect(outcome.rejectedFields).not.toContain("motifShape");
  });

  it("keeps disconnected model edges when the user drew nothing", () => {
    const outcome = coerceConstellationResult(
      {
        name: "灯守りの鯨座",
        reading: "ひもりのくじらざ",
        motif: "whale",
        paletteId: "tide",
        epithet: "夜を渡る星座",
        story:
          "古い神話では、若い鯨が遠い海の灯りを守っていた。星をたどる者だけが、その帰り道を知っているという。",
        figureEdges: [
          [0, 1],
          [2, 3],
        ],
        keywords: ["灯", "海", "帰り"],
        formReading:
          "二つの星のまとまりが左右に離れ、間に余白の星が残っている。",
      },
      { ...context, sketchEdges: [] },
    );

    expect(outcome.repaired).toBe(false);
    expect(outcome.result.figureEdges).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("adds the 座 suffix when the model omits it", () => {
    const outcome = coerceConstellationResult(
      {
        name: "灯守りの鯨",
        reading: "ひもりのくじら",
        motif: "whale",
        paletteId: "tide",
        epithet: "夜を渡る星座",
        story:
          "古い神話では、若い鯨が遠い海の灯りを守っていた。星をたどる者だけが、その帰り道を知っているという。",
        figureEdges: [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
        ],
        keywords: ["灯", "海", "帰り"],
        formReading:
          "横に広がる星々が、左上から右下へ緩やかな鎖を描いている。",
      },
      context,
    );

    expect(outcome.result.name).toBe("灯守りの鯨座");
    expect(outcome.result.reading).toBe("ひもりのくじらざ");
    expect(outcome.repaired).toBe(true);
  });

  it("repairs invalid fields without breaking playability", () => {
    const outcome = coerceConstellationResult(
      {
        name: "オリオン",
        reading: "おりおん",
        motif: "unknown",
        paletteId: "unknown",
        epithet: "",
        story: "短い",
        figureEdges: [],
        keywords: [],
      },
      context,
    );

    expect(outcome.repaired).toBe(true);
    expect(outcome.rejectedFields).toEqual(
      expect.arrayContaining([
        "motif",
        "paletteId",
        "name",
        "story",
        "epithet",
        "keywords",
      ]),
    );
    expect(outcome.result.name.length).toBeGreaterThanOrEqual(2);
    expect(outcome.result.figureEdges).toEqual([[0, 1]]);
    expect(outcome.result.motif).toBeTruthy();
  });
});
