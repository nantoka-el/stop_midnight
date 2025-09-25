# 0020: Calendarモーダルからの編集・削除フロー

Author: kirara
Edited-By: kirara 2025-09-25

- 概要: Calendarビューから日付を選択し、PLAN/REVIEWを再編集または削除できるようにする
- 状態: REVIEW（ファイル名末尾が唯一の真実）
- 受け入れ基準:
  - モーダルに「計画を編集」「レビューを編集」「削除」ボタンが追加されている
  - 編集ボタンでTODAYタブに遷移し、既存内容がフォームにロードされる
  - 削除時に確認ダイアログが表示され、データをリセットできる

## メモ
- NightPlan/NightReview構造を導入し、Calendarから編集できるよう対応済み
- 削除時はステータスピル/サマリーもリセットされる
- 後続でUndoや履歴が必要か検討

---
Change Log
- 2025-09-25 kirara: モーダル編集ボタン・削除フローを実装
- 2025-09-25 kirara: 作成
- 2025-09-25 kirara: ステータス todo → review

- 2025-09-25 kirara: ステータス review → done
