# 0008: Gitリポジトリ初期化と基本設定

Author: kirara
Edited-By: kirara 2025-09-25

- 概要: `stop_midnight` ディレクトリにGitを導入し、GitHub Pages運用を見据えた基本設定を行う
- 状態: DONE（ファイル名末尾が唯一の真実）
- 受け入れ基準:
  - Gitリポジトリが初期化され、メインブランチが `main` で用意されている
  - `.gitignore` が作成され、生成物や機密情報を除外している
  - 初期コミット方針およびGitHub Pages公開に向けた次の手順がメモされている

## メモ
- 既存ファイルを初期コミットする際はライセンスやREADMEの有無も確認する
- GitHub Pages公開には、ブランチ戦略（例: `main` + `gh-pages`）を別途検討
- 初回コミット候補: 現状の構成を `Initial scaffold` としてまとめる→その後Cloud Functions実装を小分けにコミット
- GitHub Pages 公開案: mainにソース、gh-pagesにビルド出力（将来Next/PWA構築時に設定）

---
Change Log
- 2025-09-25 kirara: 作成
- 2025-09-25 kirara: ステータス todo → review
- 2025-09-25 kirara: ステータス review → done
