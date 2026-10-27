# improvements

このディレクトリは、星座生成プロンプトの自己改善ループの記録です。

- `report-YYYY-MM-DD.md` — 人が読むための改善レポート（集計値・変更理由・新しい設定）
- `report-YYYY-MM-DD-skip.md` — サンプル不足で設定を変えなかった記録
- `report-YYYY-MM-DD-dry-run.md` — `npm run improve:dry` の提案レポート
- `summary-*.json` — 匿名集計。`.gitignore` 済み
- `proposed-config.json` — dry-run の提案。`.gitignore` 済み

## 手元で試す

```bash
npm run export              # improvements/summary-YYYY-MM-DD.json
npm run export -- --raw     # exports/raw-YYYY-MM-DD.json（gitignore、解析用）
npm run improve:dry         # config は書き換えず提案だけ
npm run improve             # config/creativity.json を更新
```

`improve` は最小サンプル数（`config/creativity.json` の `guardrails.minGenerations` / `minRatings`）に達するまで設定を変更しません。`--force` で無視できますが、研究用途では推奨しません。

## 自動実行

`.github/workflows/self-improve.yml` が毎週月曜 03:00 JST に実行します。GitHub Secrets に `DATABASE_URL` と `GEMINI_API_KEY`（または `LLM_API_KEY`）が必要です。設定に差分が出た場合だけ、ボットが `config/creativity.json` とレポートを commit / push します。Vercel はその push を自動デプロイします。

## 戻し方

設定はコードと同じ Git 管理下にあります。

```bash
git log --oneline -- config/creativity.json
git revert <commit>
git push
```

Guardrail（件数・重み・温度の範囲）はスクリプト側で強制されるため、LLMが範囲外の値を返しても反映されません。
