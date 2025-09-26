# 0027: Firestore連携による夜ログ保存

Author: nakayama
Edited-By: nakayama 2025-09-25

- 概要: TODAY/Calendarで扱うプラン・レビュー情報をFirestoreへ保存/読込できるようにする
- 状態: DONE（ファイル名末尾が唯一の真実）
- 受け入れ基準:
  - プラン確定・レビュー保存でFirestoreにNightPlan/NightReviewドキュメントが作成される
  - 初期表示時に最新データを取得し、Calendar/TODAYに反映される
  - Firestore Security Rules草案と必要なインデックスが整理されている

## メモ
- 単ユーザー前提でCollection構成を仮決めし、将来的なマルチユーザー拡張余地を残す
- フロント→Functions中継 or Firestore直書きのどちらにするかの判断を明文化する

---
Change Log
- 2025-09-26 nakayama: Firestore DB 作成・ルールデプロイ完了、運用開始を確認
- 2025-09-25 nakayama: Firestore保存/読込・認証・Rules更新を実装、レビュー待ち
- 2025-09-25 nakayama: 作成
