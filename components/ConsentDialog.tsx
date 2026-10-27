"use client";

import { BrandMark, InfoIcon, SparkleIcon } from "./Icons";
import type { ConsentMode } from "@/lib/types";

interface ConsentDialogProps {
  onChoose: (mode: ConsentMode) => void;
}

export default function ConsentDialog({ onChoose }: ConsentDialogProps) {
  return (
    <div className="modal-backdrop consent-backdrop">
      <section
        className="modal consent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
      >
        <div className="consent-orbit" aria-hidden="true">
          <span className="orbit-star star-a" />
          <span className="orbit-star star-b" />
          <span className="orbit-star star-c" />
          <span className="orbit-line line-a" />
          <span className="orbit-line line-b" />
        </div>

        <div className="consent-body">
          <div className="consent-mark">
            <BrandMark size={44} />
          </div>
          <p className="eyebrow">BEFORE WE BEGIN</p>
          <h1 id="consent-title" className="display-title">
            星に、<em>名前</em>を。
          </h1>
          <p className="consent-lead">
            星を動かし、線を引く。その形をAIが読み、この世にひとつだけの星座と神話を生み出します。
          </p>

          <div className="consent-facts">
            <div>
              <span className="fact-label">
                <SparkleIcon size={14} /> 研究のために保存
              </span>
              <p>
                星の位置と線、ことば、生まれた星座名・神話、5段階の評価。すべて匿名のセッションIDと一緒に保存します。
              </p>
            </div>
            <div>
              <span className="fact-label">
                <InfoIcon size={14} /> 保存しないもの
              </span>
              <p>
                氏名、メールアドレス、IPアドレス、端末情報。個人を特定できる情報は収集しません。
              </p>
            </div>
          </div>

          <p className="fine-print">
            生成には Google Gemini API
            を利用し、入力内容は生成処理のために送信されます。保存されたデータは本研究の分析と、星座生成プロンプトの改善にのみ使用します。同意は任意です。
          </p>
        </div>

        <div className="consent-footer">
          <div className="consent-actions">
            <button
              type="button"
              className="button primary wide"
              onClick={() => onChoose("research")}
            >
              研究に協力してはじめる
            </button>
            <button
              type="button"
              className="button ghost wide"
              onClick={() => onChoose("local")}
            >
              ローカル版で遊ぶ
            </button>
          </div>
          <p className="consent-footnote">
            ローカル版では、AIの代わりに端末内の詩的ジェネレーターを使います。データは送信されません。選択はヘルプから変更できます。
          </p>
        </div>
      </section>
    </div>
  );
}
