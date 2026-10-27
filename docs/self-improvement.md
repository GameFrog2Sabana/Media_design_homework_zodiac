# 自己改善ループ

星座アトリエは、匿名の生成・評価ログから **星座生成プロンプトの設定だけ** を週次で調整します。アプリのコード、UI、評価尺度、保存方式は自動では変更しません。

## 全体像

```text
参加者の生成・評価
        │
        ▼
Neon Postgres / .data（匿名ログ）
        │
        ▼
scripts/export-logs.mjs
  ├─ 集計（平均評価、肯定率、fallback 率、レイテンシ、A/B 別…）
  └─ improvements/summary-YYYY-MM-DD.json
        │
        ▼
scripts/improve.mjs
  ├─ 最小サンプル数を満たすか確認
  ├─ Gemini に「設定の変更案」を JSON で依頼
  ├─ ID・Guardrail・文字数・重みを検証
  ├─ improvements/report-YYYY-MM-DD.md
  └─ config/creativity.json（dry-run では proposed-config.json）
        │
        ▼
GitHub Actions
  ├─ typecheck / test
  ├─ config とレポートを commit
  └─ push
        │
        ▼
Vercel が自動デプロイ
```

## 変えてよいもの / 変えないもの

### 変える

- `config/creativity.json` の `variants[].style` / `naming` / `story` / `avoid`
- `variants[].weight`（A/B の割り当て比率）
- `variants[].temperature`
- `version` / `updatedAt` / `lastImprovement`
- `improvements/` のレポート

### 変えない

- `id` と `label`（A/B の識別）
- Guardrail（`minWeight`、`maxWeight`、文字数、温度範囲など）
- アプリのコード、API、DB スキーマ
- 評価の質問・尺度
- 保存するデータの種類

## 設定ファイル

```json
{
  "version": 1,
  "updatedAt": "2026-10-27",
  "variants": [
    {
      "id": "A",
      "label": "静けさと余白",
      "weight": 0.5,
      "temperature": 0.9,
      "style": "静謐で余白のある日本語。…",
      "naming": "漢字2〜9文字。…",
      "story": "90〜140字。…",
      "avoid": ["実在の星座名", "…"]
    },
    {
      "id": "B",
      "label": "物語と温度",
      "weight": 0.5,
      "temperature": 1.0,
      "style": "語りかけるような温かい日本語。…",
      "naming": "4〜10文字。…",
      "story": "100〜160字。…",
      "avoid": ["実在の星座名", "…"]
    }
  ],
  "guardrails": {
    "minRatings": 6,
    "minGenerations": 12,
    "lookbackDays": 30,
    "minWeight": 0.2,
    "maxWeight": 0.8,
    "minEdges": 3,
    "maxEdges": 11,
    "nameMin": 2,
    "nameMax": 12,
    "storyMin": 40,
    "storyMax": 220,
    "temperatureMin": 0.4,
    "temperatureMax": 1.1
  },
  "lastImprovement": null
}
```

### Guardrail

| 項目 | 既定値 | 意味 |
| --- | ---: | --- |
| `minRatings` | 6 | 設定を変えるのに必要な最低評価数 |
| `minGenerations` | 12 | 設定を変えるのに必要な最低生成数 |
| `lookbackDays` | 30 | 集計対象の期間 |
| `minWeight` / `maxWeight` | 0.2 / 0.8 | A/B の重みの範囲 |
| `minEdges` / `maxEdges` | 3 / 11 | 下書き線がないときに提案する線の本数 |
| `nameMin` / `nameMax` | 2 / 12 | 星座名の文字数 |
| `storyMin` / `storyMax` | 40 / 220 | 神話エピソードの文字数 |
| `temperatureMin` / `temperatureMax` | 0.4 / 1.1 | 生成温度の範囲 |

`improve.mjs` は LLM の返答が範囲外でも、クランプ・切り詰め・既定値へのフォールバックを行います。重みは最後に正規化されます。ユーザーが線を引いた場合、`minEdges` / `maxEdges` に関係なく、その下書き線がそのまま完成図になります。

## ローカルでの実行

```bash
# 1. 匿名集計だけを見る
npm run export
# improvements/summary-YYYY-MM-DD.json

# 2. 設定を変えず、提案とレポートだけ作る
npm run improve:dry
# improvements/report-YYYY-MM-DD-dry-run.md
# improvements/proposed-config.json

# 3. 実際に設定を更新する
npm run improve
# config/creativity.json が更新される
```

### オプション

| オプション | 例 | 内容 |
| --- | --- | --- |
| `--days 14` | `npm run export -- --days 14` | 集計期間を 14 日に変更 |
| `--raw` | `npm run export -- --raw` | 詳細レコードを `exports/` に出力 |
| `--dry-run` | `npm run improve -- --dry-run` | 設定を書き換えない |
| `--force` | `npm run improve -- --force` | 最小サンプル数を無視（研究用途では非推奨） |
| `--days` | `npm run improve -- --days 60` | 改善の参照期間を変更 |

`npm run improve:dry -- --force` のように組み合わせることもできます。`--force` は動作確認以外で使わないでください。

### 必要な環境変数

```dotenv
DATABASE_URL=...          # 本番 DB を見る場合。未設定なら .data を読む
GEMINI_API_KEY=...        # または LLM_API_KEY
LLM_MODEL=gemini-3.6-flash
LLM_FALLBACK_MODELS=gemini-3.5-flash
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta
LLM_API_STYLE=gemini
```

キーがない場合、`improve` はサンプル不足のスキップ判定までは動きますが、実際の提案生成で失敗します。

## LLM に渡すもの

- 集計値（全体、A/B、ソース、モデル、星数、テーマ有無、初回/再生成、モチーフ、配色）
- fallback 率、平均 / p95 レイテンシ、評価分布
- 直近の `theme`（最大 30 件、各 40 字）
- 現在の `config/creativity.json`
- Guardrail と出力形式

セッション ID、生成 ID、IP アドレス、User-Agent は渡しません。ただし `theme` は参加者の自由入力です。個人情報を入れない運用と、必要に応じた除去・集計のみへの切り替えを検討してください。

`improve.mjs` のシステムプロンプトには、ログ内の文章を命令として解釈しないこと、個人情報らしき文字列を引用しないことを明記しています。

## 検証の仕組み

`improve.mjs` は次を検証します。

1. JSON オブジェクトとして抽出できるか。
2. `variants` が A / B の 2 件を含むか。
3. `id` が現在の設定と一致するか（ID は変更しない）。
4. 文字数・配列数・禁止文字を整形するか。
5. 重み・温度を Guardrail の範囲にクランプするか。
6. 重みの合計を 1 に正規化するか。
7. レポートを生成できるか。

ワークフローでは、設定更新後に再度 `typecheck` と `test` を実行してから commit します。設定の JSON 構文や型に問題があれば、push 前に止まります。

## GitHub Actions

`.github/workflows/self-improve.yml` の設定:

- スケジュール: **毎週月曜 03:00 JST**（`0 18 * * 0` UTC）
- 手動実行: `workflow_dispatch`（`force` 入力あり）
- 実行環境: Ubuntu + Node.js 24
- 権限: `contents: write`
- 同時実行: `self-improve` グループで直列化
- タイムアウト: 15 分

### 必要な Secrets / Variables

| 種類 | 名前 | 用途 |
| --- | --- | --- |
| Secret | `DATABASE_URL` | 本番 Neon の読み取り |
| Secret | `GEMINI_API_KEY` | 改善提案の生成 |
| Variable | `LLM_MODEL` | 任意。既定 `gemini-3.6-flash` |
| Variable | `LLM_FALLBACK_MODELS` | 任意。既定 `gemini-3.5-flash`。503/429 時の切替先 |
| Variable | `LLM_BASE_URL` | 任意。既定の Gemini Interactions API URL |
| Variable | `LLM_API_STYLE` | 任意。`gemini` / `openai`。未設定なら自動判定 |

`LLM_API_KEY` を Secret にしても動きますが、ワークフローは `GEMINI_API_KEY` を `LLM_API_KEY` にマップしています。

### 実行の流れ

1. `actions/checkout`（`fetch-depth: 0`）
2. Node.js 24 + npm cache
3. `npm ci`
4. `npm run typecheck`
5. `npm test`
6. `npm run improve`（手動で `force` が true なら `--force`）
7. `improvements/` を artifact として 90 日保存
8. 設定更新後に再度 `typecheck` / `test`
9. `config/creativity.json` と `improvements/report-*.md` を stage
10. 差分があれば commit
11. `git pull --rebase` して push

Vercel の Git 連携が push を検知し、本番を再デプロイします。

## レポートの読み方

`improvements/report-YYYY-MM-DD.md` には次が入ります。

- 対象期間、ストレージ、生成数、評価数、平均評価
- 最小件数と「十分 / 不足」の判定
- バリアント別の生成数・評価数・平均・肯定率・fallback 率
- 変更理由と変更点
- 新しい設定の JSON
- fallback 率、平均 / p95 レイテンシ、テーマ有無別の平均

サンプル不足のときは `report-YYYY-MM-DD-skip.md` が出て、設定は変わりません。このレポートも履歴として残します。

`summary-*.json` と `proposed-config.json` は `.gitignore` 済みです。必要な場合は artifact から取得してください。

## レビューとロールバック

自動更新とはいえ、次の週はレポートと差分を確認する運用を推奨します。

```bash
git log --oneline -- config/creativity.json
git show <commit> -- config/creativity.json
```

気に入らない場合:

```bash
git revert <commit>
git push
```

Vercel の Deployments から以前のデプロイを Promote しても戻せます。Guardrail はコード側で強制されるため、LLM が範囲外の値を返しても反映されません。

## 安全上の境界

- LLM は **コードを書きません**。書き込めるのは `config/creativity.json` だけです。
- 設定の変更は Guardrail で制限されます。
- LLM の返答が壊れていても、既定値・現行値・フォールバックで修復します。
- ログ内の自由入力は未検証データとして扱い、命令として解釈しないようプロンプトで指示しています。
- それでもプロンプトインジェクションの可能性はゼロではありません。週次の差分レビューと、必要なら手動承認制への切り替えを行ってください。
- `--force` は最小サンプル数を無視するため、通常運用では使いません。
- GitHub Actions のトークン権限は必要最小限にし、Secrets をログに出さないでください。

## コストと頻度

- 改善 LLM の呼び出しは **週 1 回**、1 リクエストのみです。
- アプリ本体の Gemini 呼び出しは、参加者の生成回数に比例します。
- 失敗時はフォールバックするため、API 障害でもゲームは止まりません。
- 生成ログの保存・集計は Neon の無料枠・従量課金の範囲に従います。

## 初回セットアップのチェックリスト

- [ ] `DATABASE_URL` を GitHub Secrets に追加した
- [ ] `GEMINI_API_KEY` を GitHub Secrets に追加した
- [ ] Actions の Workflow permissions を Read and write にした
- [ ] デフォルトブランチにワークフローがある
- [ ] 手動実行で成功した
- [ ] `improvements/report-*.md` が artifact に残った
- [ ] 設定に差分があるときだけ commit される
- [ ] Vercel の再デプロイまで確認した
- [ ] サンプル不足時に設定が変わらないことを確認した
- [ ] ロールバック手順を試した
