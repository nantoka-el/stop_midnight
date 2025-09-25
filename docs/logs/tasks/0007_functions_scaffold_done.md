# 0007: Firebase Functions/Firestore 初期ファイルの作成

Author: kirara
Edited-By: kirara 2025-09-25

- 概要: `firebase init` が進められなかったため、必要な設定ファイル（.firebaserc, firebase.json, functions/ 等）を手動で整備する
- 状態: DONE（ファイル名末尾が唯一の真実）
- 受け入れ基準:
  - `.firebaserc` に `stop-midnight` をデフォルト登録
  - `firebase.json` が Functions (region: asia-northeast1) / Firestore の設定を含む
  - `functions/` 配下に TypeScript ベースのエントリポイントと package.json, tsconfig.json 等が揃っている

## メモ
- Firebase CLI の `firebase init` を使う場合は対話型のため、今回はテンプレ生成を手動で進める
- 初期関数はダミーで OK。後続で通知ロジックを追加予定
- 作成物: .firebaserc / firebase.json / firestore.rules / firestore.indexes.json / functions/ 配下（package.json, tsconfig*, src/index.ts 等）

---
Change Log
- 2025-09-25 kirara: 作成
- 2025-09-25 kirara: ステータス todo → review
- 2025-09-25 kirara: ステータス review → done
