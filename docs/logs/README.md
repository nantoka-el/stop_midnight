# Stop Midnight Task Logs

- tasks/: タスクMarkdown（末尾がステータスの唯一の真実 `_backlog|_todo|_review|_done`）
- viewer/: ビューアアセット（tasks.jsonもここにコピーされます）
- INDEX.md: 自動生成の目次
- .views/: Finder用リンク集（自動生成）

使い方
- タスク更新: `npm run logs-refresh`
- ビューア起動: `npm run task-viewer`（http://localhost:7777/viewer/index.html）
- 新規タスクは `docs/logs/tasks` にファイルを追加（例: `0123_feature_todo.md`）

