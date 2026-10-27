# 研究データの扱い

このドキュメントは、星座アトリエを HCI 研究で使うときのデータ設計・分析・倫理的な注意点をまとめたものです。実運用の前に、所属機関の倫理審査とデータ管理規程を必ず確認してください。

## 1. 研究のねらい

星座アトリエは、星を並べて線を引くという行為が、どのように「自分だけの星座」という物語体験につながるかを観察するための小さな実験環境です。

主な問い:

- 生成された星座名・神話エピソードは、参加者にどう評価されるか。
- プロンプトのスタイル（静けさ重視 / 物語性重視）で評価は変わるか。
- 星の数、線のまとまり方（連結 / 複数パーツ / 孤立星）、ことばの有無、再生成の回数、生成ソース（LLM / fallback）は評価と関係するか。
- ローカル生成と LLM 生成で、遊びの体験はどう違うか。

## 2. 研究デザイン

### 条件

`config/creativity.json` の 2 つのバリアント A / B を、セッション単位で割り当てます。

- **A: 静けさと余白** — 静謐で説明しすぎない文体。
- **B: 物語と温度** — 語りかけるような温かい文体。

割り当ては `sessionId + config.version` のハッシュで決まります。同じセッション・同じ設定バージョンでは、何度生成しても同じバリアントです。設定バージョンが上がると割り当てが変わり得るため、分析では `config_version` ごとに分けてください。

### 主な指標

| 指標 | 定義 |
| --- | --- |
| 平均評価 | `ratings.score` の平均（1〜5） |
| 肯定率 | 評価 4 以上の割合 |
| 再生成率 | `attempt > 1` の生成の割合 |
| fallback 率 | `source != 'llm'` の生成の割合 |
| レイテンシ | 生成リクエスト開始から応答までのミリ秒 |
| バリアント差 | A / B ごとの上記指標 |

評価は結果パネルの 1〜5 の単項目です。長い尺度や事前・事後比較は実装していません。

## 3. 同意とモード

初回表示の同意画面で、次のどちらかを選びます。

- **研究モード** — 生成と評価を匿名セッション ID とともにサーバーへ保存し、入力内容を Gemini に送信します。
- **ローカルモード** — 生成も評価もブラウザ内で完結し、外部へ送信しません。

選択は `localStorage` に保存され、ヘルプ画面からいつでも変更できます。研究モードを停止すると、以後の生成はサーバーにも Gemini にも送信されません。停止前に保存されたデータは、分析とプロンプト改善に使用されることがあります。

同意は任意です。研究に参加したくない場合は、ローカルモードで全機能を試せます。

> 実装上は「匿名」と表示していますが、同じブラウザの複数生成を結び付けられるという意味では **仮名化されたデータ** です。厳密な匿名性を主張する場合は、セッション ID を保存しない設計（都度ランダム ID）へ変更するか、分析時にセッション連結を外してください。

## 4. 保存するデータ

### `generations`

| フィールド | 内容 | 研究上の用途 |
| --- | --- | --- |
| `id` | 生成ごとの UUID | 評価との結合 |
| `session_id` | ランダムなセッション ID | 同一参加者の反復生成の把握 |
| `created_at` | 生成日時（UTC） | 時系列・期間集計 |
| `consent` | 研究同意（常に true） | 監査 |
| `variant` | A / B | 条件比較 |
| `config_version` | プロンプト設定の版 | 設定変更の前後比較 |
| `stars` | 正規化した星座標の配列 | 構図の分析 |
| `edges` | 参加者が引いた線（星インデックスの組） | 下書きの分析 |
| `aspect` | ステージの縦横比 | 画面環境の補正 |
| `theme` | 参加者が入力したことば（最大 60 字） | テーマの有無・内容の傾向 |
| `attempt` | 同じ構図での生成回数 | 再生成の分析 |
| `result` | 星座名・読み・神話エピソード・モチーフ・配色・図の線・キーワード | 生成品質の分析 |
| `source` | `llm` / `fallback` | 生成方式の比較 |
| `model` | 使用モデル名 | モデル変更の影響 |
| `latency_ms` | 生成時間 | 体験・コストの分析 |

### `ratings`

| フィールド | 内容 |
| --- | --- |
| `generation_id` | 対象の生成 UUID（主キー） |
| `session_id` | 評価者のセッション ID |
| `score` | 1〜5 |
| `created_at` | 評価日時 |

同じ生成に対する評価は上書きされます（1 生成 1 評価）。

### ブラウザ内だけに保存されるもの

- セッション ID、同意モード、最後に入力したことば
- 星図帳（最大 30 件。星座・星・線・評価を含む）

星図帳は端末の `localStorage` にあり、サーバーには同期されません。星図帳から削除しても、すでに送信された匿名ログは消えません。

### 保存しないもの

- 氏名、メールアドレス、住所、電話番号
- IP アドレス、User-Agent、端末識別子
- Cookie による広告・行動トラッキング
- ドラッグの軌跡、カーソル位置、操作時間の詳細
- 自由記述の人口統計

ただし、Vercel や Neon、Google などのインフラ事業者が、セキュリティ・課金・障害対応のために IP アドレス等を一時的に処理する場合があります。アプリの DB には保存しませんが、各サービスのプライバシーポリシーを確認してください。

## 5. データの流れ

### 研究モードの生成

```text
ブラウザ
  │  sessionId, consent, stars, edges, aspect, theme, attempt
  ▼
POST /api/generate
  │  入力検証 → バリアント決定 → プロンプト構築
  ▼
Google Gemini API（星座標・線・ことば・バリアント指示）
  │  星座名・神話・モチーフ・配色・figureEdges
  ▼
/api/generate
  │  結果を検証・補正
  ├─→ Neon Postgres（generations）
  ▼
ブラウザ（結果パネル・星図帳）
```

ユーザーが線を引いた場合、検証・補正の段階でも `figureEdges` は下書き線そのものを採用し、連結や追加は行いません。複数のまとまりや線に含まれない星もそのまま記録され、名前・神話・モチーフを読むための手がかりになります。

### 評価

```text
ブラウザ → POST /api/rate（generationId, sessionId, score）
        → ratings に upsert
```

### ローカルモード

```text
ブラウザ内の buildFallback() のみ。ネットワーク送信なし。
```

### 自己改善

```text
Neon / .data
  ▼
scripts/export-logs.mjs（匿名集計）
  ▼
scripts/improve.mjs → Gemini（集計 + 現在の設定 + recentThemes）
  ▼
Guardrail 検証 → config/creativity.json → GitHub → Vercel
```

自己改善では、直近の `theme` を最大 30 件（各 40 字）だけ `recentThemes` として LLM に渡します。自由入力のため、個人情報らしき文字列が含まれない運用にしてください。

## 6. 保存先とスキーマ

- ローカル開発: `.data/generations.jsonl`、`.data/ratings.jsonl`
- 本番: Neon Postgres（`db/schema.sql` と同じ DDL を初回生成時に自動作成）
- Vercel で `DATABASE_URL` 未設定: 保存なし（`storage: "none"`）

`db/schema.sql` には分析用の `generation_ratings` ビューもあります。`session_id` を含むため、そのまま公開・共有しないでください。

## 7. エクスポートと分析

### 集計

```bash
npm run export
# improvements/summary-YYYY-MM-DD.json
```

`summary` には次が含まれます。

- 全体・評価済み・バリアント別・ソース別・モデル別・星数別・テーマ有無別・初回/再生成別の集計
- モチーフ別・配色別の集計
- fallback 率、平均 / p95 レイテンシ、評価分布
- 直近のテーマ（最大 30 件、各 40 字）
- 現在の設定と Guardrail

### 詳細レコード

```bash
npm run export -- --raw
# exports/raw-YYYY-MM-DD.json（gitignore 済み）
```

`--raw` はセッション ID を含みます。共有フォルダやクラウドに置く場合はアクセス権を管理してください。

### SQL の例

```sql
-- 全体
select
  count(*) as generations,
  count(r.score) as ratings,
  round(avg(r.score)::numeric, 2) as mean_rating,
  round(avg((r.score >= 4)::int)::numeric, 3) as positive_rate
from generations g
left join ratings r on r.generation_id = g.id;

-- バリアント別（設定バージョンごと）
select
  g.config_version,
  g.variant,
  count(distinct g.id) as generations,
  count(r.score) as ratings,
  round(avg(r.score)::numeric, 2) as mean_rating,
  round(avg((r.score >= 4)::int)::numeric, 3) as positive_rate,
  round(avg((g.source <> 'llm')::int)::numeric, 3) as fallback_rate
from generations g
left join ratings r on r.generation_id = g.id
group by g.config_version, g.variant
order by g.config_version, g.variant;

-- 日別
select
  date_trunc('day', g.created_at) as day,
  count(*) as generations,
  count(r.score) as ratings,
  round(avg(r.score)::numeric, 2) as mean_rating
from generations g
left join ratings r on r.generation_id = g.id
group by 1
order by 1;

-- 再生成と評価
select
  case when g.attempt <= 1 then 'first' else 'regenerated' end as attempt_group,
  count(*) as generations,
  count(r.score) as ratings,
  round(avg(r.score)::numeric, 2) as mean_rating
from generations g
left join ratings r on r.generation_id = g.id
group by 1;

-- テーマの有無
select
  case when trim(g.theme) = '' then 'without-theme' else 'with-theme' end as theme_group,
  count(*) as generations,
  count(r.score) as ratings,
  round(avg(r.score)::numeric, 2) as mean_rating
from generations g
left join ratings r on r.generation_id = g.id
group by 1;
```

CSV が必要な場合は、Neon の SQL Editor から結果をコピーするか、読み取り専用ユーザーで `psql` を使ってください。

## 8. 分析上の注意

- **設定バージョンをまたいで A/B を比較しない。** バリアントの文面も重みも変わるため、`config_version` で層別します。
- **fallback を分ける。** `source = 'fallback'` は LLM の文体ではないため、生成品質の比較では別集計にします。
- **サンプル数が少ないうちに重みを解釈しない。** `config/creativity.json` の `minGenerations` / `minRatings` はそのための最低条件です。
- **評価は単項目。** 尺度の信頼性・妥当性を主張する場合は、別途検証が必要です。
- **参加者ごとの反復を無視しない。** 1 人が何度も生成すると平均がその人に引っ張られます。必要なら `session_id` 単位の平均を先に取り、参加者間で集計します。
- **自由入力は引用前に確認。** `theme` や生成物に個人情報・センシティブな内容が含まれる可能性があります。論文・発表では文脈を確認し、必要なら伏せ字にします。

## 9. 倫理・法務・セキュリティ

研究で使う前に、最低限次を確認してください。

- 所属機関の倫理審査（人を対象とする研究）の承認
- 参加者への説明と同意（任意参加、ローカルモード、停止方法、データの利用目的）
- データの保持期間と削除手順
- アクセス権（DB、`exports/`、バックアップ）
- 委託先（Vercel、Neon、Google）のデータ処理条件と保存地域
- 未成年者を対象にする場合の追加手順
- インシデント発生時の連絡・停止・キーローテーション手順

### 保持と削除の例

```sql
-- 研究終了後に全削除
delete from ratings;
delete from generations;

-- 一定期間を過ぎたデータを削除（ratings は cascade）
delete from generations
where created_at < now() - interval '365 days';

-- 特定セッションの削除（参加者からセッション ID の提供を受けた場合）
delete from ratings where session_id = '<session-id>';
delete from generations where session_id = '<session-id>';
```

アプリはセッション ID を画面に表示していないため、参加者個人とサーバー上の行を結び付けることは通常できません。個別削除を約束する場合は、参加者に参照コードを発行する UI を追加するか、同意文面で「匿名化後の個別削除はできない」と明記してください。

## 10. 公開時のチェックリスト

- [ ] 集計値だけを公開し、`session_id` / `generation_id` を含めていない
- [ ] 小さいセル（該当者 1 人など）をそのまま出していない
- [ ] 自由入力の引用は、個人情報・第三者の情報を含まないことを確認した
- [ ] A/B の比較に `config_version` を明記した
- [ ] fallback / ローカルモードの扱いを方法に書いた
- [ ] データの保持期間と削除日を記録した
- [ ] 倫理審査の承認番号・同意文面の版を記録した

## 11. 既知の限界

- セッション ID により反復生成を連結できるため、完全な匿名データではない。
- IP アドレスや User-Agent を保存しない代わりに、端末・地域・利用環境の違いを分析できない。
- ドラッグ軌跡を保存しないため、制作プロセスの分析はできない。
- 評価は 1〜5 の単項目で、参加者ごとの尺度の使い方の差を補正できない。
- ローカルモードは研究ログを残さないため、比較条件としては使えない。
- Gemini のモデル更新や API の挙動変更が、生成品質に影響し得る。
