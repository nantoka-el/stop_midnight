# 0014: Vite + TypeScriptによるフロントエンド実装

Author: kirara
Edited-By: kirara 2025-09-26

- 概要: GitHub Pagesで動作するPWAフロント（TODAY/Calendar/Setting）をVite+TypeScriptで実装し直す
- 状態: REVIEW（ファイル名末尾が唯一の真実）
- 受け入れ基準:
  - Vite(TypeScript)のセットアップが完了し、開発/ビルドが動作する
  - 現行モックのUI（3タブ構成）が移植されている
  - GitHub Pages公開を想定したビルド設定（base pathなど）が設定されている

## メモ
- UIライブラリは不要（素のCSS or Tailwind）
- PWA manifest / service workerは別タスクで扱う予定

---
Change Log
- 2025-09-25 kirara: Viteプロジェクトを生成
- 2025-09-25 kirara: 作成
- 2025-09-25 kirara: ステータス todo → review

- 2025-09-26 kirara: ステータス review → done
