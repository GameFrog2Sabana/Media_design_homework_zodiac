"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ConsentMode } from "@/lib/types";
import {
  CloseIcon,
  InfoIcon,
  MoveIcon,
  PointIcon,
  SegmentIcon,
  SparkleIcon,
} from "./Icons";

interface HelpDialogProps {
  consent: ConsentMode;
  onChangeConsent: (mode: ConsentMode) => void;
  onClose: () => void;
}

interface HealthInfo {
  storage: "postgres" | "local" | "none";
  llm: boolean;
  model: string;
  configVersion: number;
  updatedAt: string;
}

const TOOL_HELP = [
  {
    icon: MoveIcon,
    key: "V",
    title: "移動",
    text: "星をつかんで、好きな場所へ。ドラッグした軌跡は保存しません。",
  },
  {
    icon: PointIcon,
    key: "P",
    title: "点",
    text: "空をクリックすると、新しい星がひとつ増えます。3〜16個まで。",
  },
  {
    icon: SegmentIcon,
    key: "L",
    title: "線分",
    text: "星を2つ、順にクリック。線は星座の下書きになり、そのつながり方と、線に含まれない星もそのまま名前と神話に反映されます。",
  },
];

const SHORTCUTS = [
  ["V / P / L", "移動・点・線分ツール"],
  ["Delete", "選択した星を削除"],
  ["Ctrl / ⌘ + Z", "元に戻す"],
  ["Ctrl / ⌘ + Shift + Z", "やり直す"],
  ["矢印キー", "選択した星を微調整（Shiftで大きく）"],
  ["Enter", "星座を生む"],
  ["G", "星図帳を開く"],
  ["? ", "このヘルプを開く"],
  ["Esc", "選択を解除 / ダイアログを閉じる"],
];

function storageLabel(storage: HealthInfo["storage"]): string {
  if (storage === "postgres") return "Neon Postgres";
  if (storage === "local") return "ローカル（.data / JSONL）";
  return "保存なし（デモ）";
}

export default function HelpDialog({
  consent,
  onChangeConsent,
  onClose,
}: HelpDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);
  const research = consent === "research";

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    fetch("/api/health", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("health request failed");
        return response.json() as Promise<HealthInfo>;
      })
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => {
        if (!cancelled) setHealthFailed(true);
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      className="modal-backdrop help-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="help-head">
          <div>
            <span className="eyebrow">HOW TO PLAY</span>
            <h2 id={titleId}>遊び方と、データについて</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="ヘルプを閉じる"
          >
            <CloseIcon size={20} />
          </button>
        </header>

        <div className="help-scroll">
          <section className="help-hero">
            <p className="display-title small">
              空は、まだ<em>名前</em>を持たない。
            </p>
            <p>
              星を動かし、線を引く。その形と、添えたことばをAIが読み、この世にひとつだけの星座名と神話を返します。正解はありません。気に入るまで、何度でも生み直せます。
            </p>
          </section>

          <section className="help-section" aria-labelledby="help-tools">
            <div className="section-heading">
              <span>01</span>
              <h3 id="help-tools">3つの道具</h3>
            </div>
            <div className="tool-help-grid">
              {TOOL_HELP.map((tool) => {
                const Icon = tool.icon;
                return (
                  <div className="tool-help-card" key={tool.title}>
                    <span className="tool-help-icon">
                      <Icon size={22} />
                    </span>
                    <div>
                      <h4>
                        {tool.title}
                        <kbd>{tool.key}</kbd>
                      </h4>
                      <p>{tool.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="help-note">
              削除とシャッフルは左のレールの下にあります。星は3個以上、16個以下で生成できます。
            </p>
          </section>

          <section className="help-section" aria-labelledby="help-keys">
            <div className="section-heading">
              <span>02</span>
              <h3 id="help-keys">キーボード</h3>
            </div>
            <dl className="shortcut-grid">
              {SHORTCUTS.map(([key, description]) => (
                <div key={key}>
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="help-section research-section" aria-labelledby="help-research">
            <div className="section-heading">
              <span>03</span>
              <h3 id="help-research">研究とデータ</h3>
            </div>

            <div className={`mode-card ${research ? "is-research" : "is-local"}`}>
              <div className="mode-card-head">
                <span className="mode-badge">
                  <i aria-hidden="true" />
                  {research ? "研究モード" : "ローカルモード"}
                </span>
                <span className="mode-config">
                  {health ? `creativity v${health.configVersion}` : "設定を確認中"}
                </span>
              </div>
              <p>
                {research
                  ? "生成のたびに、星の座標・線・ことば・生まれた星座・評価を、匿名のセッションIDとともにサーバーへ保存します。保存先は研究用データベースです。"
                  : "生成も評価も、この端末のブラウザ内で完結します。外部への送信はありません。"}
              </p>
              <button
                type="button"
                className={`button ${research ? "danger-ghost" : "ghost"} compact`}
                onClick={() =>
                  onChangeConsent(research ? "local" : "research")
                }
              >
                {research ? "研究利用を停止する" : "研究モードに切り替える"}
              </button>
              <p className="mode-note">
                {research
                  ? "停止すると、以後の生成はサーバーにもGeminiにも送信されません。停止前に保存された匿名データは、研究の分析とプロンプト改善に使用されることがあります。"
                  : "切り替えると、以後の生成リクエストがGoogle Gemini APIと研究用ストレージに送信されます。"}
              </p>
            </div>

            <div className="research-facts">
              <div>
                <span className="fact-label">
                  <SparkleIcon size={14} /> 保存するもの
                </span>
                <ul>
                  <li>星の座標、線、添えたことば（最大60字）</li>
                  <li>生まれた星座名・読み・神話・モチーフ・配色・線の組み合わせ</li>
                  <li>1〜5の評価、匿名セッションID、生成ソース、所要時間</li>
                </ul>
              </div>
              <div>
                <span className="fact-label">
                  <InfoIcon size={14} /> 保存しないもの
                </span>
                <ul>
                  <li>氏名、メールアドレス、IPアドレス、User-Agent</li>
                  <li>ドラッグ操作の履歴、カーソル位置、端末の識別情報</li>
                  <li>Cookieによる広告トラッキング（使用していません）</li>
                </ul>
              </div>
            </div>

            <p className="help-note">
              研究モードでは、入力内容（星の座標・線・ことば）が生成処理のためにGoogle
              Gemini APIへ送信されます。保存されたデータは、本研究の分析と星座生成プロンプトの改善にのみ使用します。星図帳の削除は端末内の控えだけを消し、匿名ログは削除されません（個人の特定ができないためです）。
            </p>

            <div className="status-strip">
              {healthFailed ? (
                <span className="status-strip-failed">
                  接続情報を取得できませんでした（静的プレビューの可能性があります）
                </span>
              ) : health ? (
                <>
                  <span>
                    <i className={`status-dot ${health.llm ? "is-on" : ""}`} />
                    生成: {health.llm ? health.model : "端末内フォールバック"}
                  </span>
                  <span>
                    <i className={`status-dot ${health.storage !== "none" ? "is-on" : ""}`} />
                    保存: {storageLabel(health.storage)}
                  </span>
                  <span>設定更新: {health.updatedAt}</span>
                </>
              ) : (
                <span>接続情報を確認しています…</span>
              )}
            </div>
          </section>

          <section className="help-section about-section" aria-labelledby="help-about">
            <div className="section-heading">
              <span>04</span>
              <h3 id="help-about">この作品について</h3>
            </div>
            <p>
              「星座アトリエ」は、星を並べる行為そのものを鑑賞と物語生成の入口にするHCI研究のためのWebGLゲームです。描画はWebGL2で直接実装し、UIはGeoGebraの作図画面の静けさを参照しています。
            </p>
            <p className="about-credits">
              WebGL2 / Next.js / React — 星座生成: Google Gemini — 制作:
              筑波大学 メディアデザイン領域の授業プロジェクト
            </p>
          </section>
        </div>

        <footer className="help-foot">
          <span>変更はいつでもこの画面から行えます。</span>
          <button type="button" className="button primary compact" onClick={onClose}>
            空に戻る
          </button>
        </footer>
      </section>
    </div>
  );
}
