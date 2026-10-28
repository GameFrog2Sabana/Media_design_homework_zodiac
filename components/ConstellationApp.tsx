"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  addGalleryItem,
  clearGallery,
  getConsent,
  getSessionId,
  getThemeWord,
  loadGallery,
  removeGalleryItem,
  setConsent as persistConsent,
  setThemeWord,
  updateGalleryRating,
} from "@/lib/client-storage";
import { buildFallback } from "@/lib/fallback";
import {
  MAX_FIGURE_EDGES,
  removeEdgeByKey,
  sameEdgeSet,
  starEdgeKey,
} from "@/lib/edges";
import {
  clamp,
  edgesToIndices,
  generateDefaultStars,
  getStageRect,
  hasEdge,
  newStarId,
} from "@/lib/geometry";
import type {
  ConsentMode,
  Edge,
  GalleryItem,
  GenerationResponse,
  Point,
  Star,
  Tool,
} from "@/lib/types";
import ConsentDialog from "./ConsentDialog";
import GalleryDialog from "./GalleryDialog";
import HelpDialog from "./HelpDialog";
import ResultPanel from "./ResultPanel";
import SkyCanvas from "./SkyCanvas";
import ToolRail from "./ToolRail";
import TopBar from "./TopBar";
import { BrandMark, SparkleIcon } from "./Icons";

interface Snapshot {
  stars: Star[];
  edges: Edge[];
}

type ToastTone = "info" | "success" | "error";

interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

const MAX_STARS = 16;
const MIN_STARS = 3;
const MAX_EDGES = MAX_FIGURE_EDGES;

const TOOL_HINTS: Record<Tool, string> = {
  move: "星を動かす / 線分をクリックで選択",
  star: "空をクリックして、星を置く",
  line: "星を2つ、順にクリックして結ぶ",
};

function toPoints(stars: Star[]): Point[] {
  return stars.map((star) => ({ x: star.x, y: star.y }));
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function resultFits(result: GenerationResponse | null, starCount: number): boolean {
  if (!result) return true;
  return result.result.figureEdges.every(
    ([a, b]) => a >= 0 && b >= 0 && a < starCount && b < starCount,
  );
}

export default function ConstellationApp() {
  const [hydrated, setHydrated] = useState(false);
  const [consent, setConsent] = useState<ConsentMode | null>(null);
  const [stars, setStars] = useState<Star[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [tool, setTool] = useState<Tool>("move");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [lineStartId, setLineStartId] = useState<string | null>(null);
  const [theme, setTheme] = useState("");
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [currentItem, setCurrentItem] = useState<GalleryItem | null>(null);
  const [generating, setGenerating] = useState(false);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [activeItem, setActiveItem] = useState<GalleryItem | null>(null);
  const [resultIsNew, setResultIsNew] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const sessionIdRef = useRef("");
  const attemptRef = useRef(0);
  const generatingRef = useRef(false);
  const dragSnapshotRef = useRef<Snapshot | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const toastSeqRef = useRef(0);
  const starsRef = useRef<Star[]>(stars);
  const edgesRef = useRef<Edge[]>(edges);
  const selectedRef = useRef<string | null>(selectedId);
  const selectedEdgeRef = useRef<string | null>(selectedEdgeKey);

  starsRef.current = stars;
  edgesRef.current = edges;
  selectedRef.current = selectedId;
  selectedEdgeRef.current = selectedEdgeKey;

  const showToast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      toastSeqRef.current += 1;
      const id = toastSeqRef.current;
      setToast({ id, message, tone });
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
      }, 4600);
    },
    [],
  );

  useEffect(() => {
    sessionIdRef.current = getSessionId();
    setConsent(getConsent());
    setTheme(getThemeWord());
    setGallery(loadGallery());
    setStars(generateDefaultStars(6));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setThemeWord(theme);
  }, [theme, hydrated]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const computeAspect = useCallback((): number => {
    if (typeof window === "undefined") return 1.4;
    const stage = getStageRect(window.innerWidth, window.innerHeight);
    return clamp(stage.width / stage.height, 0.2, 5);
  }, []);

  const commit = useCallback(
    (nextStars: Star[], nextEdges: Edge[]) => {
      setPast((previous) => [
        ...previous.slice(-49),
        { stars: starsRef.current, edges: edgesRef.current },
      ]);
      setFuture([]);
      setStars(nextStars);
      setEdges(nextEdges);
    },
    [],
  );

  const clearShownResult = useCallback((message?: string) => {
    setResult(null);
    setCurrentItem(null);
    setActiveItem(null);
    setResultIsNew(false);
    if (message) showToast(message, "info");
  }, [showToast]);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedEdgeKey(null);
    setLineStartId(null);
  }, []);

  const undo = useCallback(() => {
    if (generatingRef.current || past.length === 0) return;
    const snapshot = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([...future, { stars: starsRef.current, edges: edgesRef.current }].slice(-50));
    setStars(snapshot.stars);
    setEdges(snapshot.edges);
    clearSelection();
    if (!resultFits(result, snapshot.stars.length)) {
      clearShownResult("配置が変わったため、表示中の星座を閉じました。");
    }
  }, [past, future, result, clearShownResult, clearSelection]);

  const redo = useCallback(() => {
    if (generatingRef.current || future.length === 0) return;
    const snapshot = future[future.length - 1];
    setFuture(future.slice(0, -1));
    setPast([...past, { stars: starsRef.current, edges: edgesRef.current }].slice(-50));
    setStars(snapshot.stars);
    setEdges(snapshot.edges);
    clearSelection();
    if (!resultFits(result, snapshot.stars.length)) {
      clearShownResult("配置が変わったため、表示中の星座を閉じました。");
    }
  }, [past, future, result, clearShownResult, clearSelection]);

  const addStar = useCallback(
    (x: number, y: number) => {
      if (generatingRef.current) return;
      if (starsRef.current.length >= MAX_STARS) {
        showToast(`星は${MAX_STARS}個までです。`, "info");
        return;
      }
      const star: Star = {
        id: newStarId(),
        x: clamp(x, 0.03, 0.97),
        y: clamp(y, 0.03, 0.97),
      };
      commit([...starsRef.current, star], edgesRef.current);
      setSelectedId(star.id);
      setSelectedEdgeKey(null);
      setLineStartId(null);
    },
    [commit, showToast],
  );

  const handleDragStart = useCallback(
    (id: string) => {
      if (generatingRef.current) return;
      dragSnapshotRef.current = {
        stars: starsRef.current,
        edges: edgesRef.current,
      };
      setSelectedId(id);
      setSelectedEdgeKey(null);
      setLineStartId(null);
    },
    [],
  );

  const handleDragStar = useCallback((id: string, x: number, y: number) => {
    setStars((previous) =>
      previous.map((star) => (star.id === id ? { ...star, x, y } : star)),
    );
  }, []);

  const handleDragEnd = useCallback(() => {
    const snapshot = dragSnapshotRef.current;
    dragSnapshotRef.current = null;
    if (!snapshot) return;
    const currentStars = starsRef.current;
    const changed =
      snapshot.stars.length !== currentStars.length ||
      snapshot.stars.some((star, index) => {
        const current = currentStars[index];
        return (
          !current ||
          current.id !== star.id ||
          Math.abs(current.x - star.x) > 0.0001 ||
          Math.abs(current.y - star.y) > 0.0001
        );
      });
    if (changed) {
      setPast((previous) => [...previous.slice(-49), snapshot]);
      setFuture([]);
    }
  }, []);

  const handleSelectStar = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedEdgeKey(null);
    setLineStartId(null);
  }, []);

  const handleSelectEdge = useCallback((a: string, b: string) => {
    if (generatingRef.current) return;
    setSelectedEdgeKey(starEdgeKey(a, b));
    setSelectedId(null);
    setLineStartId(null);
  }, []);

  const handleEmptyClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleLineStarClick = useCallback(
    (id: string) => {
      if (generatingRef.current) return;
      setSelectedId(id);
      setSelectedEdgeKey(null);
      if (!lineStartId) {
        setLineStartId(id);
        return;
      }
      if (lineStartId === id) {
        setLineStartId(null);
        return;
      }
      if (hasEdge(edgesRef.current, lineStartId, id)) {
        setLineStartId(null);
        showToast("その2つの星は、すでに結ばれています。", "info");
        return;
      }
      if (edgesRef.current.length >= MAX_EDGES) {
        setLineStartId(null);
        showToast(`線は${MAX_EDGES}本までです。`, "info");
        return;
      }
      commit(starsRef.current, [...edgesRef.current, { a: lineStartId, b: id }]);
      setLineStartId(null);
    },
    [lineStartId, commit, showToast],
  );

  const deleteSelected = useCallback(() => {
    if (generatingRef.current) return;

    const edgeKey = selectedEdgeRef.current;
    if (edgeKey) {
      const nextEdges = removeEdgeByKey(edgesRef.current, edgeKey);
      if (nextEdges.length === edgesRef.current.length) {
        clearSelection();
        showToast("選択した線分が見つかりませんでした。", "error");
        return;
      }
      commit(starsRef.current, nextEdges);
      clearSelection();
      if (result) {
        clearShownResult("線分を削除したため、表示中の星座をリセットしました。");
      } else {
        showToast("線分を削除しました。", "info");
      }
      return;
    }

    const id = selectedRef.current;
    if (!id) {
      showToast("先に、削除したい星か線分を選んでください。", "info");
      return;
    }
    if (starsRef.current.length <= MIN_STARS) {
      showToast(`星座には${MIN_STARS}つ以上の星が必要です。`, "error");
      return;
    }
    const nextStars = starsRef.current.filter((star) => star.id !== id);
    const nextEdges = edgesRef.current.filter(
      (edge) => edge.a !== id && edge.b !== id,
    );
    commit(nextStars, nextEdges);
    clearSelection();
    if (result) {
      clearShownResult("星を削除したため、表示中の星座をリセットしました。");
    } else {
      showToast("星と、つながっていた線を削除しました。", "info");
    }
  }, [commit, result, clearShownResult, clearSelection, showToast]);

  const shuffle = useCallback(() => {
    if (generatingRef.current) return;
    commit(generateDefaultStars(6), []);
    clearSelection();
    clearShownResult();
    showToast("6つの星を、新しく並べ直しました。", "success");
  }, [commit, clearShownResult, clearSelection, showToast]);

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (generatingRef.current || !selectedRef.current) return;
      const id = selectedRef.current;
      const current = starsRef.current.find((star) => star.id === id);
      if (!current) return;
      const nextX = clamp(current.x + dx, 0.03, 0.97);
      const nextY = clamp(current.y + dy, 0.03, 0.97);
      if (nextX === current.x && nextY === current.y) return;
      const nextStars = starsRef.current.map((star) =>
        star.id === id ? { ...star, x: nextX, y: nextY } : star,
      );
      commit(nextStars, edgesRef.current);
    },
    [commit],
  );

  const generate = useCallback(async () => {
    if (generatingRef.current) return;
    if (!consent) return;
    if (starsRef.current.length < MIN_STARS) {
      showToast(`星座には${MIN_STARS}つ以上の星が必要です。`, "error");
      return;
    }
    if (starsRef.current.length > MAX_STARS) {
      showToast(`星は${MAX_STARS}個までです。`, "error");
      return;
    }

    const snapshotStars = starsRef.current;
    const points = toPoints(snapshotStars);
    const sketch = edgesToIndices(edgesRef.current, snapshotStars);
    const aspect = computeAspect();
    const nextAttempt = attemptRef.current + 1;
    const themeValue = theme.trim().slice(0, 40);
    attemptRef.current = nextAttempt;
    generatingRef.current = true;
    setGenerating(true);
    clearSelection();
    setActiveItem(null);
    setResultIsNew(false);
    const startedAt = performance.now();
    let response: GenerationResponse | null = null;
    let failureMessage = "";

    try {
      if (consent === "local") {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 820);
        });
        const localResult = buildFallback({
          stars: points,
          sketchEdges: sketch,
          aspect,
          theme: themeValue,
          attempt: nextAttempt,
        });
        response = {
          id: makeId(),
          result: localResult,
          source: "offline",
          model: "browser-fallback",
          variant: "local",
          configVersion: 0,
          latencyMs: Math.round(performance.now() - startedAt),
          createdAt: new Date().toISOString(),
        };
      } else {
        const request = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            consent: true,
            stars: points,
            edges: sketch,
            aspect,
            theme: themeValue,
            attempt: nextAttempt,
          }),
        });
        if (!request.ok) {
          let detail = "生成サーバーに接続できませんでした。";
          try {
            const errorBody = (await request.json()) as { error?: string };
            if (errorBody?.error) detail = errorBody.error;
          } catch {
            // Keep the default message.
          }
          throw new Error(detail);
        }
        const data = (await request.json()) as GenerationResponse;
        if (
          !data?.id ||
          !data?.result ||
          !Array.isArray(data.result.figureEdges)
        ) {
          throw new Error("生成結果を読み取れませんでした。");
        }
        response = data;
      }
    } catch (error) {
      failureMessage =
        error instanceof Error ? error.message : "生成に失敗しました。";
      const localResult = buildFallback({
        stars: points,
        sketchEdges: sketch,
        aspect,
        theme: themeValue,
        attempt: nextAttempt,
      });
      response = {
        id: makeId(),
        result: localResult,
        source: "offline",
        model: "browser-fallback",
        variant: "local",
        configVersion: 0,
        latencyMs: Math.round(performance.now() - startedAt),
        createdAt: new Date().toISOString(),
      };
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }

    if (!response) return;

    // The hand-drawn figure is authoritative. The server already enforces this,
    // but keep a second guard at the display boundary so an older deployment,
    // proxy, or model regression can never re-route the user's lines.
    if (sketch.length > 0 && !sameEdgeSet(response.result.figureEdges, sketch)) {
      console.warn(
        "Generated figureEdges differed from the sketch; restoring the hand-drawn lines.",
      );
      response = {
        ...response,
        result: {
          ...response.result,
          figureEdges: sketch,
        },
      };
    }

    const item: GalleryItem = {
      id: response.id,
      result: response.result,
      stars: points,
      edges: response.result.figureEdges,
      aspect,
      createdAt: response.createdAt,
      source: response.source,
    };

    setGallery(addGalleryItem(item));
    setCurrentItem(item);
    setResult(response);
    setActiveItem(item);
    setResultIsNew(true);

    if (failureMessage) {
      showToast(`${failureMessage} 端末内で星座を生みました。`, "error");
    } else if (response.source === "fallback") {
      showToast("いまAIに届かなかったため、予備の語りで生みました。", "info");
    }
  }, [consent, theme, computeAspect, clearSelection, showToast]);

  const rateItem = useCallback(
    (item: GalleryItem, score: number) => {
      if (ratingBusy) return;
      if (!Number.isInteger(score) || score < 1 || score > 5) return;
      const nextGallery = updateGalleryRating(item.id, score);
      setGallery(nextGallery);
      setCurrentItem((current) =>
        current?.id === item.id ? { ...current, rating: score } : current,
      );
      setActiveItem((current) =>
        current?.id === item.id ? { ...current, rating: score } : current,
      );

      if (consent !== "research" || item.source === "offline") {
        showToast("評価をこの端末に保存しました。", "success");
        return;
      }

      setRatingBusy(true);
      fetch("/api/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId: item.id,
          sessionId: sessionIdRef.current,
          score,
        }),
      })
        .then(async (request) => {
          if (!request.ok) {
            let detail = "評価を保存できませんでした。";
            try {
              const body = (await request.json()) as { error?: string };
              if (body?.error) detail = body.error;
            } catch {
              // Keep the default message.
            }
            throw new Error(detail);
          }
          showToast("評価を研究用に保存しました。", "success");
        })
        .catch(() => {
          showToast(
            "端末には保存しましたが、研究用サーバーには送信できませんでした。",
            "error",
          );
        })
        .finally(() => setRatingBusy(false));
    },
    [consent, ratingBusy, showToast],
  );

  const chooseConsent = useCallback(
    (mode: ConsentMode) => {
      persistConsent(mode);
      setConsent(mode);
      showToast(
        mode === "research"
          ? "研究モードで始めます。ご協力ありがとうございます。"
          : "ローカルモードで始めます。データは送信されません。",
        mode === "research" ? "success" : "info",
      );
    },
    [showToast],
  );

  const changeConsent = useCallback(
    (mode: ConsentMode) => {
      persistConsent(mode);
      setConsent(mode);
      showToast(
        mode === "research"
          ? "研究モードに切り替えました。次の生成から匿名で保存されます。"
          : "研究利用を停止しました。以後の生成は端末内で完結します。",
        mode === "research" ? "success" : "info",
      );
    },
    [showToast],
  );

  const openCurrentResult = useCallback(() => {
    if (!currentItem) return;
    setActiveItem(currentItem);
    setResultIsNew(false);
  }, [currentItem]);

  const openGallery = useCallback(() => {
    setActiveItem(null);
    setResultIsNew(false);
    setGalleryOpen(true);
  }, []);

  const handleDeleteGalleryItem = useCallback(
    (id: string) => {
      const nextGallery = removeGalleryItem(id);
      setGallery(nextGallery);
      if (currentItem?.id === id) {
        setCurrentItem(null);
        setResult(null);
      }
      showToast(
        "星図帳から削除しました。研究用に保存された匿名ログは残ります。",
        "info",
      );
    },
    [currentItem, showToast],
  );

  const handleClearGallery = useCallback(() => {
    clearGallery();
    setGallery([]);
    setCurrentItem(null);
    setResult(null);
    setActiveItem(null);
    showToast("星図帳を空にしました。研究用の匿名ログは残ります。", "info");
  }, [showToast]);

  const stateRef = useRef({
    consent,
    helpOpen,
    galleryOpen,
    activeItem,
    lineStartId,
    selectedId,
  });
  stateRef.current = {
    consent,
    helpOpen,
    galleryOpen,
    activeItem,
    lineStartId,
    selectedId,
  };

  const actionsRef = useRef({
    undo,
    redo,
    deleteSelected,
    generate,
    nudgeSelected,
    openGallery,
    openHelp: () => setHelpOpen(true),
  });
  actionsRef.current = {
    undo,
    redo,
    deleteSelected,
    generate,
    nudgeSelected,
    openGallery,
    openHelp: () => setHelpOpen(true),
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      const state = stateRef.current;
      const modalOpen =
        state.helpOpen ||
        state.galleryOpen ||
        state.activeItem !== null ||
        state.consent === null;

      if (event.key === "Escape") {
        if (modalOpen) return;
        if (typing) return;
        setLineStartId(null);
        setSelectedId(null);
        setSelectedEdgeKey(null);
        return;
      }

      if (typing || modalOpen) return;
      const key = event.key;
      const lower = key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (lower === "z") {
          event.preventDefault();
          if (event.shiftKey) actionsRef.current.redo();
          else actionsRef.current.undo();
          return;
        }
        if (lower === "y") {
          event.preventDefault();
          actionsRef.current.redo();
          return;
        }
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (key === "v" || key === "V") {
        setTool("move");
        setLineStartId(null);
        setSelectedEdgeKey(null);
      } else if (key === "p" || key === "P") {
        setTool("star");
        setLineStartId(null);
        setSelectedEdgeKey(null);
      } else if (key === "l" || key === "L") {
        setTool("line");
        setLineStartId(null);
        setSelectedEdgeKey(null);
      } else if (key === "Delete" || key === "Backspace") {
        event.preventDefault();
        actionsRef.current.deleteSelected();
      } else if (key === "Enter") {
        if (event.repeat) return;
        event.preventDefault();
        void actionsRef.current.generate();
      } else if (key === "g" || key === "G") {
        actionsRef.current.openGallery();
      } else if (key === "?" || (key === "/" && event.shiftKey)) {
        event.preventDefault();
        actionsRef.current.openHelp();
      } else if (
        key === "ArrowLeft" ||
        key === "ArrowRight" ||
        key === "ArrowUp" ||
        key === "ArrowDown"
      ) {
        if (!state.selectedId) return;
        event.preventDefault();
        const amount = event.shiftKey ? 0.04 : 0.008;
        if (key === "ArrowLeft") actionsRef.current.nudgeSelected(-amount, 0);
        if (key === "ArrowRight") actionsRef.current.nudgeSelected(amount, 0);
        if (key === "ArrowUp") actionsRef.current.nudgeSelected(0, -amount);
        if (key === "ArrowDown") actionsRef.current.nudgeSelected(0, amount);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!hydrated) {
    return (
      <div className="boot-screen" aria-busy="true" aria-label="星座アトリエを準備しています">
        <div className="boot-orbit" aria-hidden="true">
          <span className="boot-star boot-star-a" />
          <span className="boot-star boot-star-b" />
          <span className="boot-star boot-star-c" />
        </div>
        <span className="boot-mark">
          <BrandMark size={56} />
        </span>
        <p className="boot-title">星座アトリエ</p>
        <p className="boot-sub">星を並べています</p>
      </div>
    );
  }

  const toolHint =
    tool === "line" && lineStartId
      ? "もうひとつの星をクリックして結ぶ"
      : TOOL_HINTS[tool];

  return (
    <main className={`app-shell tool-${tool} ${generating ? "is-generating" : ""}`}>
      <div className="sky-backdrop" aria-hidden="true" />
      <SkyCanvas
        stars={stars}
        edges={edges}
        tool={tool}
        selectedId={selectedId}
        selectedEdgeKey={selectedEdgeKey}
        lineStartId={lineStartId}
        result={result}
        generating={generating}
        onDragStart={handleDragStart}
        onDragStar={handleDragStar}
        onDragEnd={handleDragEnd}
        onSelectStar={handleSelectStar}
        onSelectEdge={handleSelectEdge}
        onAddStar={addStar}
        onLineStarClick={handleLineStarClick}
        onEmptyClick={handleEmptyClick}
      />

      <TopBar
        starCount={stars.length}
        edgeCount={edges.length}
        canUndo={past.length > 0 && !generating}
        canRedo={future.length > 0 && !generating}
        theme={theme}
        onThemeChange={(value) => setTheme(value.slice(0, 40))}
        onUndo={undo}
        onRedo={redo}
        onOpenGallery={openGallery}
        onOpenHelp={() => setHelpOpen(true)}
      />

      <ToolRail
        tool={tool}
        canDelete={Boolean(selectedId || selectedEdgeKey)}
        onToolChange={(nextTool) => {
          setTool(nextTool);
          setLineStartId(null);
          setSelectedEdgeKey(null);
        }}
        onDelete={deleteSelected}
        onShuffle={shuffle}
      />

      <div className="tool-status-bar" role="status">
        <span className={`status-beacon ${generating ? "is-busy" : ""}`} />
        <span>{generating ? "星の名を探しています" : toolHint}</span>
        <span className="status-divider" aria-hidden="true" />
        <span className="status-count">
          {stars.length} 星 / {edges.length} 線
        </span>
      </div>

      {currentItem && result && !activeItem ? (
        <button
          type="button"
          className="result-chip"
          onClick={openCurrentResult}
          aria-label={`${currentItem.result.name}の生成結果をもう一度見る`}
        >
          <span className="result-chip-mark">
            <SparkleIcon size={17} />
          </span>
          <span className="result-chip-copy">
            <small>星座が生まれました</small>
            <strong>{currentItem.result.name}</strong>
          </span>
        </button>
      ) : null}

      <div className="action-dock">
        <div className="dock-copy">
          <span className="eyebrow">NAME THE SKY</span>
          <p>
            {stars.length}つの星が、まだ名前を持たない。
            <span className="dock-hint">
              {theme.trim() ? `「${theme.trim()}」を手がかりに。` : "ことばは、なくてもいい。"}
            </span>
          </p>
        </div>
        <button
          type="button"
          className={`generate-button ${generating ? "is-loading" : ""}`}
          onClick={() => void generate()}
          disabled={generating || !consent}
        >
          {generating ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <SparkleIcon size={19} />
          )}
          <span>{generating ? "星座を編んでいます" : "星座を生む"}</span>
          <kbd>Enter</kbd>
        </button>
      </div>

      {generating ? (
        <div className="generating-veil" role="status" aria-live="polite">
          <div className="generating-card">
            <div className="generating-orbit" aria-hidden="true">
              <span className="orbit-ring ring-a" />
              <span className="orbit-ring ring-b" />
              <span className="orbit-core" />
              <span className="orbit-satellite satellite-a" />
              <span className="orbit-satellite satellite-b" />
            </div>
            <span className="eyebrow">READING THE STARS</span>
            <h2>星の名を、探しています。</h2>
            <p>
              {consent === "research"
                ? "星の並びとことばを読み、ひとつの神話を編んでいます。"
                : "端末の中で、星の並びにことばを重ねています。"}
            </p>
            <span className="generating-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
      ) : null}

      {!consent ? <ConsentDialog onChoose={chooseConsent} /> : null}

      {helpOpen ? (
        <HelpDialog
          consent={consent ?? "local"}
          onChangeConsent={changeConsent}
          onClose={() => setHelpOpen(false)}
        />
      ) : null}

      {galleryOpen ? (
        <GalleryDialog
          items={gallery}
          onOpen={(item) => {
            setGalleryOpen(false);
            setActiveItem(item);
            setResultIsNew(false);
          }}
          onDelete={handleDeleteGalleryItem}
          onClear={handleClearGallery}
          onClose={() => setGalleryOpen(false)}
        />
      ) : null}

      {activeItem ? (
        <ResultPanel
          item={activeItem}
          researchMode={consent === "research"}
          isNew={resultIsNew && currentItem?.id === activeItem.id}
          ratingBusy={ratingBusy}
          onRate={(score) => rateItem(activeItem, score)}
          onClose={() => {
            setActiveItem(null);
            setResultIsNew(false);
          }}
          onRegenerate={() => {
            setActiveItem(null);
            setResultIsNew(false);
            void generate();
          }}
          onOpenGallery={openGallery}
          onToast={showToast}
        />
      ) : null}

      {toast ? (
        <div
          key={toast.id}
          className={`toast toast-${toast.tone}`}
          role="status"
          aria-live="polite"
        >
          <span className="toast-mark" aria-hidden="true" />
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label="通知を閉じる"
          >
            ×
          </button>
        </div>
      ) : null}
    </main>
  );
}
