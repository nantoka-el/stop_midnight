# 0015: Firebase FCM連携の実装準備

Author: kirara
Edited-By: kirara 2025-09-25

- 概要: フロントエンドとFirebase Cloud Messagingを紐づけるための初期実装（config読み込み・トークン取得・ダミー送信テスト）を整備する
- 状態: TODO（ファイル名末尾が唯一の真実）
- 受け入れ基準:
  - Firebase設定ファイル(モック)を読み込み、ブラウザでトークン取得フローが構築されている
  - Service Worker登録と通知許可フローのUIが組み込まれている
  - Functions側で受け取る前提のAPIエンドポイント案が整理されている

## メモ
- 実トークン送信は開発用Functions/APIが整い次第
- GitHub PagesでのService Worker配置に注意（Viteのbuild設定で解決予定）

---
Change Log
- 2025-09-25 kirara: 作成
