# 0005: FCM通知基盤の設計

Author: kirara
Edited-By: kirara 2025-09-25

- 概要: Firebase Cloud Messaging を用いた夜間リマインド/フィードバック通知の設計をまとめる
- 状態: TODO（ファイル名末尾が唯一の真実）
- 受け入れ基準:
  - FCM利用時に必要なバックエンド/Functions構成が明文化されている
  - 22時帯ランダム通知・翌4時通知・21時モチベーション通知のスケジューリング方針が整理されている
  - PWA 側でのトークン取得・許可フローと iOS Safari 対応要件が列挙されている

## メモ
- Firebase プロジェクトを作成し、Node/TypeScript で Cloud Functions (2nd gen) を利用する前提。
- 単ユーザーのプロトタイプなので、設定値・テンプレートは環境変数 or Firestore Lite（1ドキュメント）で管理する。正式運用時に再設計する。
- Cloud Scheduler 構成案:
  1. **Scheduler → HTTP Function（直接送信）**: 22:00/04:00/21:00で決まった時間に呼び出し、関数内で即時にFCM送信。シンプルだが、22〜23時のランダム送信ができない。
  2. **Scheduler → enqueue Function → Cloud Tasks → delivery Function**（推奨）: 22:00にSchedulerが`enqueueNightPlanPrompt`を叩き、関数内で0〜59分のランダム遅延を持ったCloud Taskを作成。Taskが指定時刻に`deliverNightPlanPrompt`を呼び出し、FCM送信する。04:00と21:00はScheduler→HTTP Functionの直接送信で十分。
  3. **Scheduler（複数本）→ HTTP Function**: 22:05/22:25/22:45など複数のジョブを作り、関数内で「まだ送っていなければ送る」判定を行う。ジョブ管理が煩雑なので今回は見送り。
- Functions設計（案）:
  - `registerPushToken` (HTTP, callable from PWA): ブラウザから送られた FCM token を保存。
  - `enqueueNightPlanPrompt` (HTTP, Scheduler @22:00): ランダムなテンプレートを選び、Cloud Tasks に`deliverNightPlanPrompt`を遅延実行で登録。
  - `deliverNightPlanPrompt` (HTTP, Cloud Tasks): FCM に通知ペイロードを送信。
  - `sendNightReviewPrompt` (HTTP, Scheduler @04:00): フィードバック通知を即時送信。
  - `sendMotivationPing` (HTTP, Scheduler @21:00): ストリーク情報を読み出して通知。
  - （任意）`updateNightLog` (HTTP, callable): PWA から送信される夜の実績データを保存。
- Cloud Tasks を使う場合は `tasks.enqueue` 用のサービスアカウントとターゲット関数URLに対するIAM設定（`run.invoker`）が必要。個人利用なら同一プロジェクト内ロールで完結できる。
- iOS Safari Web Push 対応: APNs Auth Key をApple Developerアカウントから取得し、FCMのiOSアプリ設定に登録。PWA側は`navigator.serviceWorker.register`→`Notification.requestPermission`→`getToken`の流れ。
- 通知テンプレートは`nightPlanPrompts[]`/`reviewPrompts[]`/`motivationPrompts[]`の配列で管理し、ランダムに選ぶ。

---
Change Log
- 2025-09-25 kirara: Scheduler/Functions構成案を追記
- 2025-09-25 kirara: メモを追加
- 2025-09-25 kirara: 作成
