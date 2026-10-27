"use client";

import { useEffect, useRef, useState } from "react";
import {
  clamp,
  getStageRect,
  hashString,
  mulberry32,
  screenToStar,
  starToScreen,
} from "@/lib/geometry";
import { getPalette } from "@/lib/palettes";
import type { Edge, GenerationResponse, Star, Tool } from "@/lib/types";

interface SkyCanvasProps {
  stars: Star[];
  edges: Edge[];
  tool: Tool;
  selectedId: string | null;
  lineStartId: string | null;
  result: GenerationResponse | null;
  generating: boolean;
  onDragStart: (id: string) => void;
  onDragStar: (id: string, x: number, y: number) => void;
  onDragEnd: () => void;
  onSelectStar: (id: string) => void;
  onAddStar: (x: number, y: number) => void;
  onLineStarClick: (id: string) => void;
  onEmptyClick: () => void;
}

type Rgb = [number, number, number];

interface PointerState {
  pointerId: number;
  starId: string | null;
  startX: number;
  startY: number;
  dragging: boolean;
  moved: boolean;
}

interface BackgroundStar {
  nx: number;
  ny: number;
  size: number;
  phase: number;
  color: Rgb;
  twinkle: number;
}

const BACKGROUND_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aPosition;
layout(location = 2) in float aSize;
layout(location = 3) in float aPhase;
layout(location = 4) in vec3 aColor;
layout(location = 5) in float aTwinkle;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uParallax;
uniform float uMotion;
out vec2 vCorner;
out vec3 vColor;
out float vAlpha;

void main() {
  float flicker = 0.62 + 0.38 * sin(uTime * (0.22 + aTwinkle * 1.5) + aPhase);
  float strength = mix(0.82, flicker, uMotion);
  vec2 position = aPosition + uParallax * (0.25 + aSize * 0.14);
  vec2 clip = (position / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  vec2 offset = (aCorner * aSize * 2.2) / uResolution * 2.0;
  clip += vec2(offset.x, -offset.y);
  gl_Position = vec4(clip, 0.0, 1.0);
  vCorner = aCorner;
  vColor = aColor;
  vAlpha = strength;
}`;

const BACKGROUND_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vCorner;
in vec3 vColor;
in float vAlpha;
out vec4 outColor;

void main() {
  float r = length(vCorner);
  float core = exp(-r * r * 28.0);
  float halo = exp(-r * r * 5.0) * 0.34;
  float alpha = (core + halo) * vAlpha;
  if (alpha < 0.003) discard;
  outColor = vec4(vColor, alpha);
}`;

const STAR_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aPosition;
layout(location = 2) in float aRadius;
layout(location = 3) in float aPhase;
layout(location = 4) in vec3 aColor;
layout(location = 5) in float aState;
layout(location = 6) in float aAlpha;
uniform vec2 uResolution;
uniform float uTime;
uniform float uGenerating;
out vec2 vCorner;
out vec3 vColor;
out float vState;
out float vAlpha;
out float vPhase;

void main() {
  float pulse = 1.0 + 0.035 * sin(uTime * (1.3 + aState) + aPhase);
  float radius = aRadius * pulse * (1.0 + uGenerating * (0.06 + 0.04 * sin(uTime * 3.0 + aPhase)));
  vec2 clip = (aPosition / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  vec2 offset = (aCorner * radius * 4.4) / uResolution * 2.0;
  clip += vec2(offset.x, -offset.y);
  gl_Position = vec4(clip, 0.0, 1.0);
  vCorner = aCorner;
  vColor = aColor;
  vState = aState;
  vAlpha = aAlpha;
  vPhase = aPhase;
}`;

const STAR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vCorner;
in vec3 vColor;
in float vState;
in float vAlpha;
in float vPhase;
uniform vec3 uAccent;
uniform float uTime;
out vec4 outColor;

void main() {
  float r = length(vCorner);
  float dist = r * 4.4;
  float core = exp(-dist * dist * 5.0);
  float inner = exp(-dist * dist * 0.55) * 0.58;
  float spikes = 0.0;
  if (vState > 1.5) {
    spikes = (
      exp(-abs(vCorner.x) * 34.0) * exp(-abs(vCorner.y) * 3.3) +
      exp(-abs(vCorner.y) * 34.0) * exp(-abs(vCorner.x) * 3.3)
    ) * 0.22;
  }
  float ring = 0.0;
  if (vState > 0.5) {
    float ringDistance = abs(dist - 1.55);
    ring = smoothstep(0.13, 0.015, ringDistance) * (0.55 + 0.25 * sin(uTime * 2.2 + vPhase));
    float angle = atan(vCorner.y, vCorner.x);
    ring *= smoothstep(0.25, 0.48, abs(sin(angle * 6.0 + uTime * 0.25)));
    ring *= mix(0.4, 1.0, clamp(vState / 3.0, 0.0, 1.0));
  }
  vec3 color = mix(vColor, vec3(1.0), core * 0.7);
  vec3 ringColor = mix(uAccent, vec3(1.0), 0.3);
  float alpha = core * 1.15 + inner * 0.35 + spikes + ring * 0.7;
  alpha *= vAlpha;
  alpha = min(alpha, 0.96);
  if (alpha < 0.004) discard;
  outColor = vec4(mix(color, ringColor, ring * 0.8), alpha);
}`;

const LINE_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aP0;
layout(location = 2) in vec2 aP1;
layout(location = 3) in float aWidth;
layout(location = 4) in float aAlpha;
layout(location = 5) in vec3 aColor;
layout(location = 6) in float aDelay;
layout(location = 7) in float aDash;
layout(location = 8) in float aSeed;
uniform vec2 uResolution;
uniform float uProgress;
out vec2 vPos;
out float vLen;
out float vWidth;
out vec3 vColor;
out float vAlpha;
out float vDash;
out float vSeed;

void main() {
  vec2 delta = aP1 - aP0;
  float len = length(delta);
  vec2 dir = len > 0.001 ? delta / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float reveal = 1.0;
  if (aDelay >= 0.0) {
    reveal = smoothstep(0.0, 1.0, clamp((uProgress - aDelay) / 0.42, 0.0, 1.0));
  }
  float drawLen = max(0.001, len * reveal);
  float halfHeight = aWidth * 4.0 + 2.0;
  float pad = 2.0;
  float along = mix(-pad, drawLen + pad, aCorner.x * 0.5 + 0.5);
  vec2 position = aP0 + dir * along + normal * (aCorner.y * halfHeight);
  vec2 clip = (position / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  vPos = vec2(along, aCorner.y * halfHeight);
  vLen = drawLen;
  vWidth = aWidth;
  vColor = aColor;
  vAlpha = aAlpha;
  vDash = aDash;
  vSeed = aSeed;
}`;

const LINE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vPos;
in float vLen;
in float vWidth;
in vec3 vColor;
in float vAlpha;
in float vDash;
in float vSeed;
out vec4 outColor;

void main() {
  float qx = max(max(-vPos.x, vPos.x - vLen), 0.0);
  float distanceToLine = length(vec2(qx, vPos.y));
  float coreWidth = max(0.6, vWidth * 0.5);
  float core = 1.0 - smoothstep(coreWidth - 0.4, coreWidth + 0.9, distanceToLine);
  float glow = exp(-distanceToLine * distanceToLine / (2.0 * pow(max(1.2, vWidth * 1.9), 2.0))) * 0.32;
  float dash = 1.0;
  if (vDash > 0.0) {
    float cell = fract((vPos.x + vSeed) / vDash);
    dash = smoothstep(0.0, 0.05, cell) * (1.0 - smoothstep(0.52, 0.62, cell));
  }
  float alpha = (core * 0.9 + glow) * vAlpha * dash;
  if (alpha < 0.004) discard;
  vec3 color = mix(vColor, vec3(1.0), core * 0.5);
  outColor = vec4(color, alpha);
}`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not allocate a shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log ?? "unknown error"}`);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Could not allocate a program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log ?? "unknown error"}`);
  }
  return program;
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((character) => character + character)
          .join("")
      : value;
  const number = Number.parseInt(normalized, 16);
  return [
    ((number >> 16) & 255) / 255,
    ((number >> 8) & 255) / 255,
    (number & 255) / 255,
  ];
}

function createQuadBuffer(gl: WebGL2RenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Could not allocate a quad buffer.");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  return buffer;
}

function makeBackgroundStars(count: number): BackgroundStar[] {
  const random = mulberry32(0x51a7c0de);
  const colors: Rgb[] = [
    [0.78, 0.86, 1],
    [1, 0.94, 0.82],
    [0.88, 1, 0.96],
    [1, 0.88, 0.92],
  ];
  return Array.from({ length: count }, () => {
    const brightness = 0.24 + random() * 0.52;
    const base = colors[Math.floor(random() * colors.length)];
    return {
      nx: random(),
      ny: random(),
      size: 0.45 + random() * 1.55,
      phase: random() * Math.PI * 2,
      color: [
        base[0] * brightness,
        base[1] * brightness,
        base[2] * brightness,
      ],
      twinkle: random(),
    };
  });
}

export default function SkyCanvas({
  stars,
  edges,
  tool,
  selectedId,
  lineStartId,
  result,
  generating,
  onDragStart,
  onDragStar,
  onDragEnd,
  onSelectStar,
  onAddStar,
  onLineStarClick,
  onEmptyClick,
}: SkyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    stars,
    edges,
    tool,
    selectedId,
    lineStartId,
    result,
    generating,
  });
  const callbacksRef = useRef({
    onDragStart,
    onDragStar,
    onDragEnd,
    onSelectStar,
    onAddStar,
    onLineStarClick,
    onEmptyClick,
  });
  const pointerRef = useRef<PointerState | null>(null);
  const hoverRef = useRef<string | null>(null);
  const pointerPositionRef = useRef({ x: 0, y: 0 });
  const pointerTargetRef = useRef({ x: 0, y: 0 });
  const pointerInsideRef = useRef(false);
  const resultStartRef = useRef(0);
  const lastResultId = useRef<string | null>(null);
  const [webglError, setWebglError] = useState(false);

  stateRef.current = {
    stars,
    edges,
    tool,
    selectedId,
    lineStartId,
    result,
    generating,
  };
  callbacksRef.current = {
    onDragStart,
    onDragStar,
    onDragEnd,
    onSelectStar,
    onAddStar,
    onLineStarClick,
    onEmptyClick,
  };

  useEffect(() => {
    if (result?.id && result.id !== lastResultId.current) {
      lastResultId.current = result.id;
      resultStartRef.current = performance.now();
    }
    if (!result) {
      lastResultId.current = null;
      resultStartRef.current = 0;
    }
  }, [result]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      gl = null;
    }

    if (!gl) {
      setWebglError(true);
      return;
    }

    setWebglError(false);
    const context = gl;
    const canvasElement = canvas;

    let disposed = false;
    let raf = 0;
    let bgProgram: WebGLProgram;
    let starProgram: WebGLProgram;
    let lineProgram: WebGLProgram;
    let bgVao: WebGLVertexArrayObject;
    let starVao: WebGLVertexArrayObject;
    let lineVao: WebGLVertexArrayObject;
    let bgInstanceBuffer: WebGLBuffer;
    let starInstanceBuffer: WebGLBuffer;
    let lineInstanceBuffer: WebGLBuffer;
    const quadBuffer = createQuadBuffer(context);
    const bgStars = makeBackgroundStars(
      Math.min(
        620,
        Math.max(180, Math.round((window.innerWidth * window.innerHeight) / 2700)),
      ),
    );
    let bgInstanceData = new Float32Array(bgStars.length * 8);
    let resolution: [number, number] = [1, 1];
    let cssWidth = 1;
    let cssHeight = 1;
    let dpr = 1;
    let bgReady = false;
    let pointerCurrentX = 0;
    let pointerCurrentY = 0;
    const reduceMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let reduceMotion = reduceMotionQuery.matches;

    const makeProgram = (vertex: string, fragment: string) => {
      const program = createProgram(context, vertex, fragment);
      return program;
    };

    try {
      bgProgram = makeProgram(BACKGROUND_VERTEX, BACKGROUND_FRAGMENT);
      starProgram = makeProgram(STAR_VERTEX, STAR_FRAGMENT);
      lineProgram = makeProgram(LINE_VERTEX, LINE_FRAGMENT);

      const bgVaoLocal = context.createVertexArray();
      const starVaoLocal = context.createVertexArray();
      const lineVaoLocal = context.createVertexArray();
      const bgBufferLocal = context.createBuffer();
      const starBufferLocal = context.createBuffer();
      const lineBufferLocal = context.createBuffer();
      if (
        !bgVaoLocal ||
        !starVaoLocal ||
        !lineVaoLocal ||
        !bgBufferLocal ||
        !starBufferLocal ||
        !lineBufferLocal
      ) {
        throw new Error("Could not allocate WebGL resources.");
      }
      bgVao = bgVaoLocal;
      starVao = starVaoLocal;
      lineVao = lineVaoLocal;
      bgInstanceBuffer = bgBufferLocal;
      starInstanceBuffer = starBufferLocal;
      lineInstanceBuffer = lineBufferLocal;
    } catch (error) {
      console.error("Sky renderer setup failed:", error);
      setWebglError(true);
      return;
    }

    const bgResolutionLocation = context.getUniformLocation(
      bgProgram,
      "uResolution",
    );
    const bgTimeLocation = context.getUniformLocation(bgProgram, "uTime");
    const bgParallaxLocation = context.getUniformLocation(bgProgram, "uParallax");
    const bgMotionLocation = context.getUniformLocation(bgProgram, "uMotion");
    const starResolutionLocation = context.getUniformLocation(
      starProgram,
      "uResolution",
    );
    const starTimeLocation = context.getUniformLocation(starProgram, "uTime");
    const starGeneratingLocation = context.getUniformLocation(
      starProgram,
      "uGenerating",
    );
    const starAccentLocation = context.getUniformLocation(
      starProgram,
      "uAccent",
    );
    const lineResolutionLocation = context.getUniformLocation(
      lineProgram,
      "uResolution",
    );
    const lineProgressLocation = context.getUniformLocation(
      lineProgram,
      "uProgress",
    );

    function buildBackgroundData() {
      bgInstanceData = new Float32Array(bgStars.length * 8);
      for (let i = 0; i < bgStars.length; i += 1) {
        const star = bgStars[i];
        const offset = i * 8;
        bgInstanceData[offset] = star.nx * cssWidth * dpr;
        bgInstanceData[offset + 1] = star.ny * cssHeight * dpr;
        bgInstanceData[offset + 2] = star.size * dpr;
        bgInstanceData[offset + 3] = star.phase;
        bgInstanceData[offset + 4] = star.color[0];
        bgInstanceData[offset + 5] = star.color[1];
        bgInstanceData[offset + 6] = star.color[2];
        bgInstanceData[offset + 7] = star.twinkle;
      }
      bgReady = true;
    }

    function setupBackgroundVao() {
      context.bindVertexArray(bgVao);
      context.bindBuffer(context.ARRAY_BUFFER, quadBuffer);
      context.enableVertexAttribArray(0);
      context.vertexAttribPointer(0, 2, context.FLOAT, false, 0, 0);
      context.bindBuffer(context.ARRAY_BUFFER, bgInstanceBuffer);
      context.enableVertexAttribArray(1);
      context.vertexAttribPointer(1, 2, context.FLOAT, false, 32, 0);
      context.bindBuffer(context.ARRAY_BUFFER, bgInstanceBuffer);
      context.bindBuffer(context.ARRAY_BUFFER, bgInstanceBuffer);
      context.vertexAttribDivisor(1, 1);
      context.enableVertexAttribArray(2);
      context.vertexAttribPointer(2, 1, context.FLOAT, false, 32, 8);
      context.vertexAttribDivisor(2, 1);
      context.enableVertexAttribArray(3);
      context.vertexAttribPointer(3, 1, context.FLOAT, false, 32, 12);
      context.vertexAttribDivisor(3, 1);
      context.enableVertexAttribArray(4);
      context.vertexAttribPointer(4, 3, context.FLOAT, false, 32, 16);
      context.vertexAttribDivisor(4, 1);
      context.enableVertexAttribArray(5);
      context.vertexAttribPointer(5, 1, context.FLOAT, false, 32, 28);
      context.vertexAttribDivisor(5, 1);
      context.bindVertexArray(null);
    }

    function setupStarVao() {
      context.bindVertexArray(starVao);
      context.bindBuffer(context.ARRAY_BUFFER, quadBuffer);
      context.enableVertexAttribArray(0);
      context.vertexAttribPointer(0, 2, context.FLOAT, false, 0, 0);
      context.bindBuffer(context.ARRAY_BUFFER, starInstanceBuffer);
      context.enableVertexAttribArray(1);
      context.vertexAttribPointer(1, 2, context.FLOAT, false, 36, 0);
      context.vertexAttribDivisor(1, 1);
      context.enableVertexAttribArray(2);
      context.vertexAttribPointer(2, 1, context.FLOAT, false, 36, 8);
      context.vertexAttribDivisor(2, 1);
      context.enableVertexAttribArray(3);
      context.vertexAttribPointer(3, 1, context.FLOAT, false, 36, 12);
      context.vertexAttribDivisor(3, 1);
      context.enableVertexAttribArray(4);
      context.vertexAttribPointer(4, 3, context.FLOAT, false, 36, 16);
      context.vertexAttribDivisor(4, 1);
      context.enableVertexAttribArray(5);
      context.vertexAttribPointer(5, 1, context.FLOAT, false, 36, 28);
      context.vertexAttribDivisor(5, 1);
      context.enableVertexAttribArray(6);
      context.vertexAttribPointer(6, 1, context.FLOAT, false, 36, 32);
      context.vertexAttribDivisor(6, 1);
      context.bindVertexArray(null);
    }

    function setupLineVao() {
      context.bindVertexArray(lineVao);
      context.bindBuffer(context.ARRAY_BUFFER, quadBuffer);
      context.enableVertexAttribArray(0);
      context.vertexAttribPointer(0, 2, context.FLOAT, false, 0, 0);
      context.bindBuffer(context.ARRAY_BUFFER, lineInstanceBuffer);
      context.enableVertexAttribArray(1);
      context.vertexAttribPointer(1, 2, context.FLOAT, false, 48, 0);
      context.vertexAttribDivisor(1, 1);
      context.enableVertexAttribArray(2);
      context.vertexAttribPointer(2, 2, context.FLOAT, false, 48, 8);
      context.vertexAttribDivisor(2, 1);
      context.enableVertexAttribArray(3);
      context.vertexAttribPointer(3, 1, context.FLOAT, false, 48, 16);
      context.vertexAttribDivisor(3, 1);
      context.enableVertexAttribArray(4);
      context.vertexAttribPointer(4, 1, context.FLOAT, false, 48, 20);
      context.vertexAttribDivisor(4, 1);
      context.enableVertexAttribArray(5);
      context.vertexAttribPointer(5, 3, context.FLOAT, false, 48, 24);
      context.vertexAttribDivisor(5, 1);
      context.enableVertexAttribArray(6);
      context.vertexAttribPointer(6, 1, context.FLOAT, false, 48, 36);
      context.vertexAttribDivisor(6, 1);
      context.enableVertexAttribArray(7);
      context.vertexAttribPointer(7, 1, context.FLOAT, false, 48, 40);
      context.vertexAttribDivisor(7, 1);
      context.enableVertexAttribArray(8);
      context.vertexAttribPointer(8, 1, context.FLOAT, false, 48, 44);
      context.vertexAttribDivisor(8, 1);
      context.bindVertexArray(null);
    }

    setupBackgroundVao();
    setupStarVao();
    setupLineVao();

    function resize() {
      const rect = canvasElement.getBoundingClientRect();
      cssWidth = Math.max(1, rect.width);
      cssHeight = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(cssWidth * dpr));
      const height = Math.max(1, Math.round(cssHeight * dpr));
      if (canvasElement.width !== width || canvasElement.height !== height) {
        canvasElement.width = width;
        canvasElement.height = height;
      }
      resolution = [width, height];
      context.viewport(0, 0, width, height);
      buildBackgroundData();
      context.bindBuffer(context.ARRAY_BUFFER, bgInstanceBuffer);
      context.bufferData(context.ARRAY_BUFFER, bgInstanceData, context.DYNAMIC_DRAW);
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvasElement);

    const handleMotionChange = () => {
      reduceMotion = reduceMotionQuery.matches;
    };
    reduceMotionQuery.addEventListener("change", handleMotionChange);

    const startTime = performance.now();
    let lastNow = startTime;

    context.disable(context.DEPTH_TEST);
    context.enable(context.BLEND);
    context.blendFunc(context.SRC_ALPHA, context.ONE);
    context.clearColor(0, 0, 0, 0);

    function frame(now: number) {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const delta = Math.min(50, now - lastNow);
      lastNow = now;
      const elapsed = (now - startTime) / 1000;
      const time = reduceMotion ? 0 : elapsed;

      const state = stateRef.current;
      const localReduceMotion = reduceMotion;
      const targetX = localReduceMotion ? 0 : pointerTargetRef.current.x * 9 * dpr;
      const targetY = localReduceMotion ? 0 : pointerTargetRef.current.y * 9 * dpr;
      pointerCurrentX += (targetX - pointerCurrentX) * Math.min(1, delta / 900);
      pointerCurrentY += (targetY - pointerCurrentY) * Math.min(1, delta / 900);

      const progress = (() => {
        if (!state.result) return 1;
        if (localReduceMotion || resultStartRef.current === 0) return 1;
        const raw = clamp((now - resultStartRef.current) / 1700, 0, 1);
        return 1 - Math.pow(1 - raw, 3);
      })();

      context.clear(context.COLOR_BUFFER_BIT);

      // Background star field
      context.useProgram(bgProgram);
      context.bindVertexArray(bgVao);
      context.uniform2f(bgResolutionLocation, resolution[0], resolution[1]);
      context.uniform1f(bgTimeLocation, time);
      context.uniform2f(bgParallaxLocation, pointerCurrentX, pointerCurrentY);
      context.uniform1f(bgMotionLocation, localReduceMotion ? 0 : 1);
      if (bgReady) {
        context.bindBuffer(context.ARRAY_BUFFER, bgInstanceBuffer);
        context.drawArraysInstanced(
          context.TRIANGLE_STRIP,
          0,
          4,
          bgStars.length,
        );
      }

      const cssStage = getStageRect(cssWidth, cssHeight);
      const starsInState = state.stars;
      const stagePoints = starsInState.map((star) => starToScreen(star, cssStage));
      const starColors = state.result
        ? hexToRgb(getPalette(state.result.result.paletteId).star)
        : ([1, 0.95, 0.82] as Rgb);
      const primary = state.result
        ? hexToRgb(getPalette(state.result.result.paletteId).primary)
        : hexToRgb("#F2D59A");
      const secondary = state.result
        ? hexToRgb(getPalette(state.result.result.paletteId).secondary)
        : hexToRgb("#9BD7FF");

      const figureEdgeCount = state.result?.result.figureEdges.length ?? 0;
      const maxLines = Math.max(
        24,
        state.edges.length + figureEdgeCount + 4,
      );
      const lineData = new Float32Array(maxLines * 12);
      let lineCount = 0;
      const pushLine = (
        ax: number,
        ay: number,
        bx: number,
        by: number,
        width: number,
        alpha: number,
        color: Rgb,
        delay: number,
        dash: number,
        seed: number,
      ) => {
        if (lineCount >= maxLines) return;
        const offset = lineCount * 12;
        lineData[offset] = ax;
        lineData[offset + 1] = ay;
        lineData[offset + 2] = bx;
        lineData[offset + 3] = by;
        lineData[offset + 4] = width;
        lineData[offset + 5] = alpha;
        lineData[offset + 6] = color[0];
        lineData[offset + 7] = color[1];
        lineData[offset + 8] = color[2];
        lineData[offset + 9] = delay;
        lineData[offset + 10] = dash;
        lineData[offset + 11] = seed;
        lineCount += 1;
      };

      const starIndexById = new Map<string, number>();
      starsInState.forEach((star, index) => starIndexById.set(star.id, index));

      if (state.result) {
        for (const edge of state.edges) {
          const a = starIndexById.get(edge.a);
          const b = starIndexById.get(edge.b);
          if (a === undefined || b === undefined) continue;
          const start = stagePoints[a];
          const end = stagePoints[b];
          pushLine(
            start.x * dpr,
            start.y * dpr,
            end.x * dpr,
            end.y * dpr,
            1.0 * dpr,
            0.16,
            starColors,
            -1,
            0,
            0,
          );
        }
        const figure = state.result.result.figureEdges;
        for (let i = 0; i < figure.length; i += 1) {
          const [a, b] = figure[i];
          const start = stagePoints[a];
          const end = stagePoints[b];
          if (!start || !end) continue;
          pushLine(
            start.x * dpr,
            start.y * dpr,
            end.x * dpr,
            end.y * dpr,
            (1.7 + i * 0.03) * dpr,
            0.95,
            primary,
            0.1 + i * 0.085,
            0,
            i * 17,
          );
        }
      } else {
        for (const edge of state.edges) {
          const a = starIndexById.get(edge.a);
          const b = starIndexById.get(edge.b);
          if (a === undefined || b === undefined) continue;
          const start = stagePoints[a];
          const end = stagePoints[b];
          pushLine(
            start.x * dpr,
            start.y * dpr,
            end.x * dpr,
            end.y * dpr,
            1.15 * dpr,
            0.58,
            starColors,
            -1,
            0,
            0,
          );
        }
      }

      if (
        state.tool === "line" &&
        state.lineStartId &&
        pointerInsideRef.current
      ) {
        const startIndex = starIndexById.get(state.lineStartId);
        if (startIndex !== undefined) {
          const start = stagePoints[startIndex];
          const pointerDeviceX = pointerPositionRef.current.x * dpr;
          const pointerDeviceY = pointerPositionRef.current.y * dpr;
          pushLine(
            start.x * dpr,
            start.y * dpr,
            pointerDeviceX,
            pointerDeviceY,
            1.0 * dpr,
            0.5,
            secondary,
            -1,
            6 * dpr,
            time * 20,
          );
        }
      }

      if (lineCount > 0) {
        context.useProgram(lineProgram);
        context.bindVertexArray(lineVao);
        context.uniform2f(lineResolutionLocation, resolution[0], resolution[1]);
        context.uniform1f(lineProgressLocation, progress);
        context.bindBuffer(context.ARRAY_BUFFER, lineInstanceBuffer);
        context.bufferData(
          context.ARRAY_BUFFER,
          lineData.subarray(0, lineCount * 12),
          context.DYNAMIC_DRAW,
        );
        context.drawArraysInstanced(context.TRIANGLE_STRIP, 0, 4, lineCount);
      }

      // Foreground stars
      const starData = new Float32Array(starsInState.length * 9);
      for (let i = 0; i < starsInState.length; i += 1) {
        const star = starsInState[i];
        const point = stagePoints[i];
        const isSelected = state.selectedId === star.id;
        const isLineStart = state.lineStartId === star.id;
        const isHover = hoverRef.current === star.id;
        const starState = isLineStart ? 3 : isSelected ? 2 : isHover ? 1 : 0;
        const seed = hashString(star.id);
        // Foreground stars need to read as touchable points against the
        // background field, so keep them roughly 2.4x the old core size.
        const radius =
          (2.5 + ((seed >>> 8) % 100) / 100) *
          2.4 *
          (1 + (starState > 0 ? 0.05 : 0)) *
          dpr;
        const offset = i * 9;
        starData[offset] = point.x * dpr;
        starData[offset + 1] = point.y * dpr;
        starData[offset + 2] = radius;
        starData[offset + 3] = (seed % 628) / 100;
        starData[offset + 4] = starColors[0];
        starData[offset + 5] = starColors[1];
        starData[offset + 6] = starColors[2];
        starData[offset + 7] = starState;
        starData[offset + 8] = isSelected || isLineStart ? 1 : 0.9;
      }

      if (starsInState.length > 0) {
        context.useProgram(starProgram);
        context.bindVertexArray(starVao);
        context.uniform2f(starResolutionLocation, resolution[0], resolution[1]);
        context.uniform1f(starTimeLocation, time);
        context.uniform1f(starGeneratingLocation, state.generating ? 1 : 0);
        context.uniform3f(
          starAccentLocation,
          primary[0],
          primary[1],
          primary[2],
        );
        context.bindBuffer(context.ARRAY_BUFFER, starInstanceBuffer);
        context.bufferData(context.ARRAY_BUFFER, starData, context.DYNAMIC_DRAW);
        context.drawArraysInstanced(
          context.TRIANGLE_STRIP,
          0,
          4,
          starsInState.length,
        );
      }
    }

    raf = requestAnimationFrame(frame);

    function cleanup() {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      reduceMotionQuery.removeEventListener("change", handleMotionChange);
      context.deleteBuffer(quadBuffer);
      context.deleteBuffer(bgInstanceBuffer);
      context.deleteBuffer(starInstanceBuffer);
      context.deleteBuffer(lineInstanceBuffer);
      context.deleteVertexArray(bgVao);
      context.deleteVertexArray(starVao);
      context.deleteVertexArray(lineVao);
      context.deleteProgram(bgProgram);
      context.deleteProgram(starProgram);
      context.deleteProgram(lineProgram);
    }

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const findStarAt = (
      clientX: number,
      clientY: number,
      pointerType = "mouse",
    ): Star | null => {
      const rect = canvas.getBoundingClientRect();
      const stage = getStageRect(rect.width, rect.height);
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const threshold = pointerType === "touch" ? 34 : 26;
      let best: Star | null = null;
      let bestDistance = threshold;

      const starsNow = stateRef.current.stars;
      for (let i = starsNow.length - 1; i >= 0; i -= 1) {
        const star = starsNow[i];
        const point = starToScreen(star, stage);
        const d = Math.hypot(point.x - x, point.y - y);
        if (d <= bestDistance) {
          bestDistance = d;
          best = star;
        }
      }
      return best;
    };

    const toStagePoint = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const stage = getStageRect(rect.width, rect.height);
      return screenToStar(
        { x: clientX - rect.left, y: clientY - rect.top },
        stage,
      );
    };

    const updateCursor = (star: Star | null, pointerType: string) => {
      const current = stateRef.current;
      if (current.generating) {
        canvas.style.cursor = "wait";
        return;
      }
      if (current.tool === "move") {
        canvas.style.cursor =
          pointerRef.current?.dragging && pointerRef.current.moved
            ? "grabbing"
            : star
              ? "grab"
              : "default";
      } else if (current.tool === "line") {
        canvas.style.cursor = star ? "pointer" : "crosshair";
      } else {
        canvas.style.cursor = star ? "pointer" : "crosshair";
      }
      void pointerType;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (stateRef.current.generating) return;
      const star = findStarAt(event.clientX, event.clientY, event.pointerType);
      const pointer: PointerState = {
        pointerId: event.pointerId,
        starId: star?.id ?? null,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
        moved: false,
      };
      pointerRef.current = pointer;
      pointerInsideRef.current = true;
      pointerPositionRef.current = {
        x: event.clientX - canvas.getBoundingClientRect().left,
        y: event.clientY - canvas.getBoundingClientRect().top,
      };

      if (stateRef.current.tool === "move") {
        if (star) {
          pointer.dragging = true;
          hoverRef.current = star.id;
          callbacksRef.current.onDragStart(star.id);
          try {
            canvas.setPointerCapture(event.pointerId);
          } catch {
            // Pointer capture can fail on some embedded browsers.
          }
        } else {
          callbacksRef.current.onEmptyClick();
        }
      } else if (stateRef.current.tool === "star") {
        if (star) {
          callbacksRef.current.onSelectStar(star.id);
          hoverRef.current = star.id;
        } else {
          const point = toStagePoint(event.clientX, event.clientY);
          callbacksRef.current.onAddStar(point.x, point.y);
        }
      } else {
        if (star) {
          callbacksRef.current.onLineStarClick(star.id);
          hoverRef.current = star.id;
        } else {
          callbacksRef.current.onEmptyClick();
        }
      }

      updateCursor(star, event.pointerType);
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerInsideRef.current = true;
      pointerPositionRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      pointerTargetRef.current = {
        x: clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
        y: clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1),
      };

      const pointer = pointerRef.current;
      if (
        pointer &&
        pointer.dragging &&
        stateRef.current.tool === "move" &&
        pointer.pointerId === event.pointerId
      ) {
        const dx = event.clientX - pointer.startX;
        const dy = event.clientY - pointer.startY;
        if (!pointer.moved && Math.hypot(dx, dy) > (event.pointerType === "touch" ? 3.5 : 2.2)) {
          pointer.moved = true;
        }
        if (pointer.moved && pointer.starId) {
          const point = toStagePoint(event.clientX, event.clientY);
          callbacksRef.current.onDragStar(
            pointer.starId,
            clamp(point.x, 0.03, 0.97),
            clamp(point.y, 0.03, 0.97),
          );
        }
      }

      const star = pointer?.dragging
        ? null
        : findStarAt(event.clientX, event.clientY, event.pointerType);
      if (!pointer?.dragging) {
        hoverRef.current = star?.id ?? null;
      }
      updateCursor(star, event.pointerType);
    };

    const finishPointer = (event: PointerEvent) => {
      const pointer = pointerRef.current;
      if (!pointer) return;
      if (pointer.dragging) {
        callbacksRef.current.onDragEnd();
      }
      if (canvas.hasPointerCapture(event.pointerId)) {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore.
        }
      }
      pointerRef.current = null;
      const star = findStarAt(event.clientX, event.clientY, event.pointerType);
      hoverRef.current = star?.id ?? null;
      updateCursor(star, event.pointerType);
    };

    const onPointerLeave = () => {
      pointerInsideRef.current = false;
      if (!pointerRef.current?.dragging) {
        hoverRef.current = null;
        canvas.style.cursor = "default";
      }
    };

    const onPointerEnter = () => {
      pointerInsideRef.current = true;
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", finishPointer);
    canvas.addEventListener("pointercancel", finishPointer);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointerenter", onPointerEnter);
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", finishPointer);
      canvas.removeEventListener("pointercancel", finishPointer);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerenter", onPointerEnter);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  return (
    <div className="sky-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="sky-canvas"
        aria-label="星図キャンバス。移動ツールでは星をドラッグして動かせます。点ツールでは空をクリックして星を追加し、線分ツールでは2つの星を順にクリックして結びます。"
        role="application"
        tabIndex={0}
      />
      {webglError ? (
        <div className="webgl-error">
          <p>このブラウザでは WebGL2 を利用できません。</p>
          <p>最新の Chrome / Edge / Safari / Firefox でお試しください。</p>
        </div>
      ) : null}
    </div>
  );
}
