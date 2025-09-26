# 0006: Firebase CLI セットアップと初期設定

Author: kirara
Edited-By: kirara 2025-09-26

- 概要: Firebase CLI を用いて stop_midnight 用のプロジェクト設定を行い、通知基盤の準備を整える
- 状態: REVIEW（ファイル名末尾が唯一の真実）
- 受け入れ基準:
  - Firebase プロジェクト ID / リージョン方針が決まっている
  - `firebase login` `firebase projects:list` などでCLIが動作確認済み
  - Functions/Hosting 無しのベース構成で `firebase init`（Functions, Firestore, Hostingのうち必要なもの） の初期化計画がまとまっている

## メモ
- プロジェクトID: `stop-midnight`（作成済み、DisplayName: Stop Midnight）
- 既存プロジェクト: `koushien-2025` と併存。`firebase projects:list --json` で確認。
- 利用リージョン: Functions/Firestore ともに `asia-northeast1` (東京) を想定。
- 今後の手順案:
  1. `firebase init` は対話型のため実行せず、0007で手動スキャフォールドを作成済み。
  2. `.firebaserc` を手動作成し `stop-midnight` をデフォルト登録済み。
  3. Cloud Scheduler / Cloud Tasks API を GCP Console or CLI で有効化し、サービスアカウント権限を整理（別タスク化予定）。
- APNs Auth Key の登録など、FCM iOS対応は別タスクで扱う。

---
Change Log
- 2025-09-25 kirara: プロジェクト作成・確認ログを追記
- 2025-09-25 kirara: 作成

- 2025-09-25 kirara: ステータス todo → review

- 2025-09-26 kirara: ステータス review → done
