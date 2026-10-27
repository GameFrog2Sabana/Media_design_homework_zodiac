# デプロイ手順

星座アトリエを **Vercel + Neon Postgres + Google Gemini** で公開するための手順です。ローカルだけで遊ぶ場合は [README](../README.md) の「すぐに動かす」までで構いません。

## 前提

- Node.js **22.9 以上**（`package.json` の `engines`）
- GitHub アカウント
- Vercel アカウント
- Neon アカウント（本番で研究ログを保存する場合）
- Google AI Studio で発行した Gemini API キー（AI 生成を使う場合）

DB と Gemini はどちらも任意です。未設定でもアプリは動きますが、Vercel では保存なし・LLM なしのデモ動作になります。

## 1. ローカルで本番ビルドを確認する

```bash
npm ci
npm run typecheck
npm test
npm run build
npm start
```

<http://localhost:3000/api/health> が `ok: true` を返し、画面が表示されることを確認します。

## 2. GitHub に push する

```bash
git add -A
git commit -m "feat: constellation atelier"
git branch -M main
git remote add origin https://github.com/<your-account>/<repo>.git
git push -u origin main
```

`.env.local`、`.data/`、`exports/`、`node_modules/`、`.next/` は `.gitignore` 済みです。API キーや参加者データをコミットしないでください。

## 3. Neon Postgres を用意する

1. [Neon](https://neon.tech/) でプロジェクトを作成します。
2. アプリに近いリージョンを選びます（Vercel の `vercel.json` は `hnd1` = 東京）。
3. ダッシュボードから **connection string** をコピーします。

```text
postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

アプリは初回の生成時に `generations` / `ratings` テーブルとインデックスを自動作成します（`lib/server/store.ts`）。権限を絞った DB ユーザーを使う場合や、事前に確認したい場合は [db/schema.sql](../db/schema.sql) を Neon の SQL Editor で実行してください。

> 本番用の接続文字列は Vercel の環境変数にだけ置きます。リポジトリやブラウザには出しません。

### テーブルの最小確認

```sql
select count(*) from generations;
select score, count(*) from ratings group by score order by score;
```

## 4. Gemini API キーを用意する

1. [Google AI Studio](https://aistudio.google.com/app/apikey) で API キーを作成します。
2. 既定では `gemini-3.6-flash` を Gemini の Interactions API で呼びます。別のモデルを使う場合は `LLM_MODEL` を変更します。
3. OpenAI 互換エンドポイントを使う場合は `LLM_BASE_URL` を変更し、必要なら `LLM_API_STYLE=openai` を設定します。URL は `/chat/completions` まで含めても、含めなくても構いません。

```dotenv
GEMINI_API_KEY=...
LLM_MODEL=gemini-3.6-flash
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta
LLM_API_STYLE=gemini
```

キーが未設定、または Gemini が失敗した場合、サーバーはローカルフォールバックを返します。画面は止まりません。

## 5. Vercel にデプロイする

1. Vercel で **Add New → Project** を選び、GitHub リポジトリを import します。
2. Framework Preset は **Next.js** のままにします。Build Command / Output Directory は既定値で構いません。
3. **Settings → Environment Variables** に次を追加します。

| Key | Value | Environment |
| --- | --- | --- |
| `DATABASE_URL` | Neon の接続文字列 | Production（必要なら Preview も） |
| `GEMINI_API_KEY` | Gemini API キー | Production（必要なら Preview も） |
| `LLM_MODEL` | `gemini-3.6-flash` など（任意） | Production |
| `LLM_BASE_URL` | 既定値のまま（任意） | Production |
| `LLM_API_STYLE` | 既定値のまま（任意） | Production |

4. Node.js のバージョンが 22 以上になっていることを確認します（`package.json` の `engines` が優先されます）。
5. **Deploy** を押します。
6. 初回デプロイ後、環境変数を追加・変更した場合は **Redeploy** が必要です。

`vercel.json` で東京リージョン（`hnd1`）とセキュリティヘッダーを設定しています。DB も東京付近に置くとレイテンシが小さくなります。

## 6. 本番動作を確認する

1. `https://<your-app>.vercel.app/api/health` を開きます。

```json
{
  "ok": true,
  "storage": "postgres",
  "llm": true,
  "model": "gemini-3.6-flash",
  "configVersion": 1,
  "updatedAt": "2026-10-27"
}
```

`storage: "none"` の場合は `DATABASE_URL` が届いていません。`llm: false` の場合は API キーが届いていません。どちらも環境変数と Redeploy を確認してください。

2. 研究モードを選び、星を動かして「星座を生む」を押します。
3. 結果パネルで評価を付けます。
4. Neon で `generations` と `ratings` に 1 行ずつ増えることを確認します。
5. ローカルモードに切り替え、生成してもネットワークに `/api/generate` が飛ばないことを確認します。
6. 星図帳を開き、PNG がダウンロードできることを確認します。

## 7. 週次自己改善を有効にする（任意）

`.github/workflows/self-improve.yml` は毎週月曜 03:00 JST に、匿名ログから `config/creativity.json` を更新します。

1. GitHub リポジトリの **Settings → Secrets and variables → Actions** を開きます。
2. **Secrets** に次を追加します。

| Name | 用途 |
| --- | --- |
| `DATABASE_URL` | 本番 Neon の接続文字列（読み取りに使用） |
| `GEMINI_API_KEY` | 設定改善の LLM 呼び出し |

3. **Variables** に必要なら `LLM_MODEL` / `LLM_BASE_URL` を追加します。
4. **Settings → Actions → General → Workflow permissions** で **Read and write permissions** を有効にします。
5. **Actions → Self-improve constellation prompts → Run workflow** で手動実行し、成功を確認します。

ワークフローは以下を行います。

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run improve`（サンプル不足なら設定を変えずスキップレポートだけ作成）
5. レポートを artifact として 90 日保存
6. 差分があれば `config/creativity.json` と `improvements/report-*.md` を commit / push

push を Vercel の Git 連携が検知し、自動で再デプロイします。ブランチ保護や必須レビューを設定している場合、ボットの push が拒否されることがあります。その場合はワークフロー用のバイパス設定を検討するか、PR を作る方式に変更してください。

> GitHub Actions のスケジュール実行は、デフォルトブランチにワークフローがある場合だけ動きます。また、公開リポジトリで 60 日間コミットがないと自動停止されることがあります。

## 8. 更新とロールバック

### 通常の更新

```bash
git add -A
git commit -m "fix: ..."
git push
```

Vercel が自動でビルド・デプロイします。

### 設定だけを戻す

```bash
git log --oneline -- config/creativity.json
git revert <commit>
git push
```

### アプリ全体を戻す

Vercel の **Deployments** から以前の成功デプロイを選び、**Promote to Production** を実行します。Git の履歴も戻す場合は `git revert` を使ってください。

## 9. トラブルシューティング

| 症状 | 確認すること |
| --- | --- |
| `/api/health` が 404 | Next.js のデプロイが成功しているか。`app/api/health/route.ts` が含まれているか。 |
| `storage: "none"` | Vercel に `DATABASE_URL` があるか。値の前後に空白や改行がないか。追加後に Redeploy したか。 |
| `llm: false` | `GEMINI_API_KEY` または `LLM_API_KEY` が Production に設定されているか。Redeploy したか。 |
| 生成は動くが毎回「予備の語り」 | Gemini のキー・モデル名・クォータ（quota）を確認。Vercel の Function Logs に `Constellation LLM failed` が出ていないか。 |
| 評価が 503 | 生成ログが保存されていない（`storage: "none"`）、または `generations` に同じ `session_id` の行がない。 |
| 429 が返る | 1 セッション 60 秒に 18 回の簡易レート制限。待ってから再試行。 |
| DB のテーブルがない | `db/schema.sql` を Neon で実行。DB ユーザーに CREATE 権限があるか確認。 |
| ビルドが Node のバージョンで失敗 | Vercel の Node.js Version を 22.x に設定。`package.json` の `engines` を確認。 |
| 自己改善が push できない | Actions の Workflow permissions、ブランチ保護、`contents: write` を確認。 |

## 10. セキュリティと運用

- `GEMINI_API_KEY` / `DATABASE_URL` は **サーバー専用** です。`NEXT_PUBLIC_` を付けたり、クライアントコードに書いたりしないでください。
- キーを誤って push した場合は、ただちに Gemini 側で無効化し、Neon のパスワードをローテーションしてください。
- Neon は本番用と分析用で接続情報を分けると安全です。分析用は読み取り専用ユーザーにすることを推奨します。
- 研究データの取り扱い・同意・保持期間は [docs/research.md](research.md) を確認してください。
- Vercel の Function Logs にはエラー詳細が出ます。参加者の自由入力（ことば）をログに出す実装はしていませんが、運用時のログ確認方針は定めてください。
- 本番では Vercel の WAF / Rate Limiting など、エッジ側の制限も検討してください。アプリ内のレート制限はインスタンス単位の簡易的なものです。
