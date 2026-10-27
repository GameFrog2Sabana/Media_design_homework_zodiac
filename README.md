# 星座アトリエ / Constellation Atelier

星を動かし、線を引く。その形と、添えたことばを AI が読み、この世にひとつだけの星座名・神話・星図を返す WebGL2 ゲームです。

UI は [GeoGebra Geometry](https://mat.geogebra.org/geometry?lang=ja) の静かな作図画面を参照しています。Three.js は使わず、星・線・背景を WebGL2 で直接描画しています。

## 特徴

- **3 つの道具だけ** — 移動、点（星）、2 点を結ぶ線分。数式や複雑な設定はありません。
- **6 つの星から開始** — ドラッグで動かし、3〜16 個の星で星座をつくれます。
- **AI が絵柄まで生成** — 「〜座」の星座名、読み、神話エピソード、モチーフ（鯨・狐・龍など 16 種）、配色、星図の線を返します。
- **線のつながりをそのまま読む** — 引いた線は追加も連結もせず、そのまま完成図に。複数のまとまり、輪・鎖・枝分かれ、線に含まれない星も、名前・神話・絵柄に反映します。
- **研究モード / ローカルモード** — 研究モードは匿名ログを保存。ローカルモードは通信せず端末内で完結します。
- **星図帳と PNG 書き出し** — 作った星座はブラウザ内に最大 30 件保存され、ポスター画像として書き出せます。
- **自己改善ループ** — 匿名の生成・評価ログから、週次で生成プロンプトの設定だけを LLM が調整します。

## すぐに動かす

必要なもの: **Node.js 22.9 以上**。

```bash
npm install
cp .env.example .env.local   # Windows は copy .env.example .env.local
npm run dev
```

<http://localhost:3000> を開きます。

`.env.local` がなくても動きます。その場合、星座生成はサーバー内のローカルフォールバック、保存は `.data/*.jsonl` になります。Gemini を使うときだけ `GEMINI_API_KEY` を設定してください。

```dotenv
# .env.local
GEMINI_API_KEY=your-api-key
LLM_MODEL=gemini-3.6-flash
```

## 環境変数

| 変数 | 必須 | 説明 |
| --- | :---: | --- |
| `DATABASE_URL` | — | Neon Postgres の接続文字列。未設定ならローカル開発では `.data/`、Vercel では保存なし。 |
| `GEMINI_API_KEY` | — | Google Gemini API キー。`LLM_API_KEY` でも可。未設定ならローカルフォールバック。 |
| `LLM_API_KEY` | — | OpenAI 互換 API のキー。`GEMINI_API_KEY` より優先。 |
| `LLM_MODEL` | — | 既定値 `gemini-3.6-flash`。Gemini 3 系は Interactions API で呼びます。 |
| `LLM_BASE_URL` | — | 既定値 `https://generativelanguage.googleapis.com/v1beta`（Gemini Interactions API）。OpenAI 互換サーバーなら `/chat/completions` を持つ URL に変更します。 |
| `LLM_API_STYLE` | — | `gemini` / `openai`。未設定なら URL から自動判定します。 |

API キーはサーバー側でのみ読みます。`NEXT_PUBLIC_` を付けないでください。

## 遊び方

| 操作 | 内容 |
| --- | --- |
| 星をドラッグ | 移動 |
| 空をクリック（点ツール） | 星を追加 |
| 星を 2 つクリック（線分ツール） | 線を引く |
| `V` / `P` / `L` | 移動 / 点 / 線分ツール |
| `Delete` | 選択した星を削除 |
| `Ctrl` / `⌘` + `Z` | 元に戻す |
| `Ctrl` / `⌘` + `Shift` + `Z` | やり直す |
| 矢印キー | 選択した星を微調整（`Shift` で大きく） |
| `Enter` | 星座を生む |
| `G` | 星図帳 |
| `?` | ヘルプ |
| `Esc` | 選択解除 / ダイアログを閉じる |

「ことば」は任意です。テーマを添えると、AI がその気配を神話に取り込みます。

## 2 つのモード

初回に選択し、ヘルプ画面からいつでも変更できます。

| | 研究モード | ローカルモード |
| --- | --- | --- |
| 生成 | サーバーの `/api/generate` 経由で Gemini | ブラウザ内のフォールバック生成 |
| 保存 | 匿名セッション ID とともに研究用ストレージへ | 端末の `localStorage` のみ |
| 評価 | `/api/rate` に送信 | 端末内のみ |
| 外部送信 | 星の座標・線・ことばを Gemini へ | なし |

研究モードでも Gemini が未設定・失敗のときは、サーバー側のフォールバックが返ります。その場合も `source: "fallback"` として匿名ログに残ります（評価は保存対象）。ローカルモードの生成は `source: "offline"` で、API も保存も呼びません。

## 構成

```text
app/                 画面、グローバル CSS、API ルート
components/          WebGL キャンバス、結果パネル、星図帳、ヘルプ、同意画面
lib/                 幾何、線分補正、フォールバック生成、検証、PNG 書き出し
lib/server/          Gemini 接続、プロンプト、保存、レート制限、設定読み込み
config/creativity.json  自己改善の対象になるプロンプト設定
scripts/             ログ集計・自己改善スクリプト
db/schema.sql        Neon Postgres のスキーマ
.github/workflows/   週次自己改善
docs/                デプロイ・研究・自己改善の手順書
```

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm start` | 本番サーバー |
| `npm run typecheck` | TypeScript の型検査 |
| `npm test` | Vitest |
| `npm run export` | 匿名集計を `improvements/summary-YYYY-MM-DD.json` に出力 |
| `npm run export -- --raw` | 詳細レコードを `exports/` に出力（gitignore 済み） |
| `npm run improve:dry` | 設定を変えず改善提案だけ作成 |
| `npm run improve` | 十分なサンプルがあれば `config/creativity.json` を更新 |

## 研究データと自己改善

- 保存するもの: 星の座標、線、ことば、生成結果、バリアント、生成ソース、レイテンシ、1〜5 の評価、匿名セッション ID。
- 保存しないもの: 氏名、メールアドレス、IP アドレス、User-Agent、ドラッグ軌跡、Cookie によるトラッキング。
- ローカル開発では `.data/generations.jsonl` / `.data/ratings.jsonl`、本番では Neon Postgres に保存します。
- 自己改善はコードを書き換えません。`config/creativity.json` のプロンプト・A/B 重み・温度だけを、Guardrail の範囲内で更新します。

詳しい手順は以下を参照してください。

- [デプロイ手順](docs/deploy.md)
- [研究データの扱い](docs/research.md)
- [自己改善ループ](docs/self-improvement.md)
- [改善レポートの置き場所](improvements/README.md)

## デプロイ

Vercel + Neon Postgres + Gemini API を想定しています。最小構成は次の 3 つです。

1. リポジトリを GitHub に push して Vercel に import。
2. `GEMINI_API_KEY` と（本番保存用の）`DATABASE_URL` を Vercel の環境変数に設定。
3. `/api/health` が `llm: true`、`storage: "postgres"` を返すことを確認。

GitHub Actions による週次自己改善も使う場合は、GitHub Secrets に `DATABASE_URL` と `GEMINI_API_KEY` を追加します。詳細は [docs/deploy.md](docs/deploy.md) を参照してください。

## 実装メモ

- 星・線・背景は WebGL2 のシェーダーで描画。DPR とリサイズに対応。
- 星座の `figureEdges` は LLM の出力を検証し、範囲外・重複・交差しすぎる線を補正。
- 生成結果の各フィールドが不正でも、フォールバックで必ず遊べる形に修復。
- 画像は Canvas 2D で星図ポスターを合成し、PNG としてダウンロード。
- レート制限はインスタンス内メモリの簡易実装（1 セッションあたり 60 秒に 18 回）。本格的な制限はエッジ側で追加してください。

## 既知の制約

- Vercel で `DATABASE_URL` を設定しない場合、生成は動きますが研究ログは保存されません（評価 API は 503）。
- 星図帳はブラウザの `localStorage` に保存されるため、端末・ブラウザをまたぎません。
- Gemini の無料枠・レイテンシ・利用規約は、利用するアカウントの条件に従います。
- 研究利用には、所属機関の倫理審査・同意文面・データ保持期間の確認が必要です。
