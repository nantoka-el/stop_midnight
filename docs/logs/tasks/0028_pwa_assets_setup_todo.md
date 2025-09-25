# 0028: PWAアイコンとmanifest整備

Author: nakayama
Edited-By: nakayama 2025-09-25

- 概要: ホーム画面追加に必要なPWAアイコン/manifest/service worker設定を整備する
- 状態: TODO（ファイル名末尾が唯一の真実）
- 受け入れ基準:
  - `manifest.webmanifest` と複数解像度のアプリアイコンが用意され、Pages公開版で配信されている
  - Service Worker が PWA要件を満たす（オフライン対応範囲を定義）
  - iOS用メタタグ（`apple-touch-icon` など）が設定されている

## メモ
- アイコンデザイン案の検討と生成方法もタスク内で整理
- 将来のApp Store審査を見越し、ネーミングとブランドカラーを決めておく

---
Change Log
- 2025-09-25 nakayama: 作成
