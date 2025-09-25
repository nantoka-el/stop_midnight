# 0026: FCMプッシュ通知の一気通貫実装

Author: nakayama
Edited-By: nakayama 2025-09-25

- 概要: フロントでのトークン取得から Functions 経由での FCM送信まで通しで動作させる
- 状態: TODO（ファイル名末尾が唯一の真実）
- 受け入れ基準:
  - Web Push向け VAPID Key と Firebase Web設定を整備し、フロントから通知許可/トークン取得が行える
  - Functions 側にトークン登録APIと通知送信エンドポイントを用意し、テスト送信で実機に通知が届く
  - iOS Safari（ホーム画面追加）対応に向けたAPNs設定手順と残課題を整理しておく

## メモ
- まずはデスクトップ/Androidブラウザでの確認を優先し、iOS対応は証明書準備後に検証予定
- セキュリティのため.envやSecret Managerへの移行方針も合わせて検討する
- Firebase Web設定:
  ```js
  const firebaseConfig = {
    apiKey: "AIzaSyBahhVWxtoWTV6Zwo7Bh5ucmivJdBIKp0g",
    authDomain: "stop-midnight.firebaseapp.com",
    projectId: "stop-midnight",
    storageBucket: "stop-midnight.firebasestorage.app",
    messagingSenderId: "372275431449",
    appId: "1:372275431449:web:aa9314f106b32a4df74288"
  }
  ```
- Web Push VAPID 公開鍵: `BL2zzNfK5mbFt_75bWyZ_V1HoI7AOwsHbbLAQDvYHlnY-W4ETfUdRMW2WG-Zr9JKawpABqE6RKAfk_fLo52bBMQ`
- iOS Safari Web Push を有効化するには Apple Developer Program（年額99USD）への加入と APNs Auth Key 登録が必要

---
Change Log
- 2025-09-25 nakayama: 作成
