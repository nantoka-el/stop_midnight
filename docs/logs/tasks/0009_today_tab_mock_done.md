# 0009: TODAYタブのモック実装

Author: kirara
Edited-By: kirara 2025-09-25

- 概要: TODAYタブでプランナー／レビュー両方の状態を切り替えられるモックUIを作成する
- 状態: DONE（ファイル名末尾が唯一の真実）
- 受け入れ基準:
  - displayNameと通知テンプレートの差し込みが確認できる
  - Planner状態でプラン入力フォームと推奨カードが表示される
  - Review状態で評価(◎/○/△/✕)とメモ入力が表示され、切り替えが可能

## メモ
- シンプルな静的HTML/CSS/JSで実装し、実データはモック値でOK
- 後続でFCM連携やデータ保存を差し替えられる構造を意識する

---
Change Log
- 2025-09-25 kirara: 作成
- 2025-09-25 kirara: ステータス todo → review
- 2025-09-25 kirara: ステータス review → done
