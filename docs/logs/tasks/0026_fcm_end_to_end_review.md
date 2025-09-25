# 0026: FCMプッシュ通知の一気通貫実装

Author: nakayama
Edited-By: nakayama 2025-09-25

- 概要: フロントでのトークン取得から Functions 経由での FCM送信まで通しで動作させる
- 状態: REVIEW（ファイル名末尾が唯一の真実）
- 受け入れ基準:
  - Web Push向け VAPID Key と Firebase Web設定を整備し、フロントから通知許可/トークン取得が行える
  - Functions 側にトークン登録APIと通知送信エンドポイントを用意し、テスト送信で実機に通知が届く
  - iOS Safari（ホーム画面追加）対応に向けたAPNs設定手順と残課題を整理しておく

## メモ
- まずはデスクトップ/Androidブラウザでの確認を優先し、iOS対応は証明書準備後に検証予定
- セキュリティのため.envやSecret Managerへの移行方針も合わせて検討する
- Firebase Web設定:
- `.env` 経由で各種 Firebase 設定を注入する（`VITE_FIREBASE_*` 系）。リポジトリには `.env.example` を用意しておく
- Web Push VAPID 公開鍵は Secrets で管理し、`.env` から読み込む
- GitHub Pages 配信時は Actions Secrets に以下を登録してビルドする
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
  - `VITE_FIREBASE_VAPID_KEY`
  - `VITE_FUNCTIONS_BASE_URL`
- iOS Safari Web Push を有効化するには Apple Developer Program（年額99USD）への加入と APNs Auth Key 登録が必要

---
Change Log
- 2025-09-25 nakayama: GitHub Pages/Secretsまで整備しレビュー待ち
- 2025-09-25 nakayama: 作成
