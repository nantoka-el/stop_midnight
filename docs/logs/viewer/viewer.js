/**
 * Task Viewer JavaScript
 * タスクビューアーのメインスクリプト
 * 検索、表示、モーダル管理機能
 * 
 * tasks.json対応版
 */

(function() {
    'use strict';
    
    // グローバル変数
    // 配信元を docs/logs 直下に統一（task-viewerは docs/logs をドキュメントルートで提供）
    const USE_ABSOLUTE_PATHS = true; // 絶対パス参照に固定
    const ABS_BASE = '/'; // http://localhost:8888/ を基準に '/tasks.json' 等を参照
    const rel = (p) => p;
    const abs = (p) => ABS_BASE + (p.startsWith('/') ? p.slice(1) : p);
    const buildUrl = (p) => USE_ABSOLUTE_PATHS ? abs(p) : rel(p);

    let tasksData = {};
    let allTaskCards = [];
    let searchHistory = JSON.parse(localStorage.getItem('taskSearchHistory') || '[]');
    let autoUpdateTimer = null;
    let fullTextSearchEnabled = false;
    let searchDebounceTimer = null;
    let searchIndexCache = null;  // 検索インデックスのキャッシュ
    let sse = null; // SSE接続
    let apiAvailable = false;
    // 直前のタスク一覧（id->status）のスナップショット（差分検出用）
    let prevTaskIndex = null;
    
    // 設定ファイルを読み込む
    async function loadConfig() {
        try {
            const response = await fetch(buildUrl('.taskconfig.json'));
            if (response.ok) {
                const config = await response.json();
                return config.statuses;
            }
        } catch (e) {
            console.warn('設定ファイルの読み込みに失敗:', e);
        }
        return [
            { key: 'backlog', label: 'BACKLOG', color: '#6b7280' },
            { key: 'todo', label: 'TODO', color: '#3b82f6' },
            { key: 'review', label: 'REVIEW', color: '#eab308' },
            { key: 'done', label: 'DONE', color: '#22c55e' }
        ];
    }
    
    async function loadTasks() {
        console.log('loadTasks() called at:', new Date().toLocaleTimeString('ja-JP'));
        try {
            const prevIndex = prevTaskIndex;
            // 検索用配列をクリア
            allTaskCards = [];
            tasksData = {};
            
            // tasks.jsonを読み込む（キャッシュ無効化）
            let tasksResponse = await fetch(buildUrl('/tasks.json') + '?t=' + Date.now());
            if (!tasksResponse.ok) {
                // viewer直下でホストされている場合のフォールバック
                tasksResponse = await fetch(buildUrl('tasks.json') + '?t=' + Date.now());
            }
            if (!tasksResponse.ok) {
                throw new Error('tasks.jsonの読み込みに失敗しました');
            }
            const tasksJson = await tasksResponse.json();
            
            // 設定ファイルからステータスを取得
            const statusConfig = await loadConfig();
            const statuses = statusConfig.map(s => s.key);
            let totalCount = 0;
            
            // tasks.jsonデータをstatusでグループ化
            const tasksByStatus = {};
            console.log('Total tasks loaded:', tasksJson.length);
            tasksJson.forEach(task => {
                if (!tasksByStatus[task.status]) {
                    tasksByStatus[task.status] = [];
                }
                tasksByStatus[task.status].push(task);
            });
            
            // デバッグ: 各ステータスのタスク数を表示
            console.log('Tasks by status:', {
                backlog: tasksByStatus.backlog?.length || 0,
                todo: tasksByStatus.todo?.length || 0,
                review: tasksByStatus.review?.length || 0,
                done: tasksByStatus.done?.length || 0
            });
            
            // タスク0136の確認
            const task0136 = tasksJson.find(t => t.id === '0136');
            if (task0136) {
                console.log('Task 0136 found:', task0136);
            }
            
            // 各ステータスごとに表示
            for (const status of statuses) {
                const listEl = document.getElementById(`${status}-list`);
                const countEl = document.getElementById(`${status}-count`);
                
                if (!listEl || !countEl) continue;
                
                const tasks = tasksByStatus[status] || [];
                
                listEl.innerHTML = '';
                
                if (tasks.length === 0) {
                    listEl.innerHTML = '<div class="empty">タスクなし</div>';
                    countEl.textContent = '0';
                } else {
                    countEl.textContent = tasks.length;
                    totalCount += tasks.length;
                    
                    // タスクIDでソート
                    tasks.sort((a, b) => {
                        const idA = parseInt(a.id || '0');
                        const idB = parseInt(b.id || '0');
                        return idA - idB;
                    });
                    
                    for (const task of tasks) {
                        const taskId = task.id || '---';
                        const taskTitle = task.title
                            .replace(/^#\s*タスク\d+:\s*/, '')
                            .replace(/^#\s*/, '');
                        
                        const card = document.createElement('div');
                        card.className = 'task-card';
                        card.innerHTML = `
                            <span class="task-id">${taskId}</span>
                            <span class="task-title">${taskTitle}</span>
                        `;
                        
                        const taskKey = `${status}_${taskId}`;
                        
                        // 検索用データを保存（元のtitleとidも保存）
                        allTaskCards.push({
                            element: card,
                            id: taskId.toLowerCase(),
                            idRaw: (task.idRaw || '').toLowerCase(),
                            aliases: Array.isArray(task.aliases) ? task.aliases.map(a => String(a).toLowerCase()) : [],
                            title: taskTitle.toLowerCase(),
                            status: status,
                            originalId: taskId,
                            originalTitle: taskTitle,
                            filename: task.filename
                        });
                        
                        // タスクデータを保存
                        const taskPath = USE_ABSOLUTE_PATHS
                          ? abs(`/tasks/${task.filename}`)
                          : `../tasks/${task.filename}`;
                        tasksData[taskKey] = {
                            file: task.filename,
                            path: taskPath,
                            status: status,
                            id: taskId,
                            name: taskTitle
                        };
                        
                        // DnD属性
                        card.setAttribute('draggable', 'true');
                        card.addEventListener('dragstart', (ev) => {
                            ev.dataTransfer.setData('text/plain', JSON.stringify({
                                key: taskKey,
                                filename: task.filename,
                                id: taskId,
                                fromStatus: status
                            }));
                        });
                        card.onclick = () => showTask(taskKey);
                        
                        listEl.appendChild(card);
                    }
                }
            }
            
            // 合計数を更新
            const totalEl = document.getElementById('total-count');
            if (totalEl) {
                totalEl.textContent = `全${totalCount}件`;
            }
            
            // 更新日時を表示
            const lastUpdateEl = document.getElementById('last-update');
            if (lastUpdateEl) {
                lastUpdateEl.textContent = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }
            
            console.log('Tasks loaded successfully at:', new Date().toLocaleTimeString('ja-JP'));
            
            // 差分検出：新規追加とステータス変更を検知
            try {
                const currIndex = {};
                if (Array.isArray(tasksJson)) {
                    for (const t of tasksJson) {
                        if (!t || !t.id) continue;
                        currIndex[t.id] = (t.status || '').toLowerCase();
                    }
                }
                if (prevIndex && Object.keys(prevIndex).length > 0) {
                    const created = Object.keys(currIndex).filter(id => !(id in prevIndex)).map(id => ({ id, to: currIndex[id] }));
                    const changed = Object.keys(currIndex)
                        .filter(id => (id in prevIndex) && prevIndex[id] !== currIndex[id])
                        .map(id => ({ id, from: prevIndex[id], to: currIndex[id] }));
                    // 新規は常に表示（NEW→current）
                    for (const c of created) {
                        showStatusSplash(c.id, 'NEW', c.to || 'TODO');
                    }
                    // ステータス変更は to が review/done のとき派手表示
                    for (const ch of changed) {
                        if (['review','done'].includes(ch.to)) {
                            showStatusSplash(ch.id, ch.from || '', ch.to || '');
                        }
                    }
                }
                prevTaskIndex = currIndex;
            } catch (diffErr) {
                console.warn('diff detection error:', diffErr);
            }
            
        } catch (error) {
            console.error('タスクの読み込みエラー:', error);
            // エラー時の処理
            const statuses = ['backlog', 'todo', 'review', 'done'];
            statuses.forEach(status => {
                const listEl = document.getElementById(`${status}-list`);
                if (listEl) {
                    listEl.innerHTML = '<div class="error">読み込みエラー</div>';
                }
            });
        }
    }

    // DnDスプラッシュ表示（3秒）
    let splashTimer = null;
    let lastSplash = { key: null, at: 0 };
    function showStatusSplash(taskId, fromStatus, toStatus) {
        try {
            const splash = document.getElementById('status-splash');
            const content = document.getElementById('status-splash-content');
            if (!splash || !content) return;
            const fmt = (s) => (s || '').toString().toUpperCase();
            const key = `${taskId}:${fmt(fromStatus)}->${fmt(toStatus)}`;
            const now = Date.now();
            if (lastSplash.key === key && (now - lastSplash.at) < 1000) return; // 連発抑止
            lastSplash = { key, at: now };
            content.textContent = `${taskId}\n${fmt(fromStatus)} → ${fmt(toStatus)}`;
            splash.classList.add('active');
            if (splashTimer) clearTimeout(splashTimer);
            splashTimer = setTimeout(() => {
                splash.classList.remove('active');
            }, 3000);
        } catch {}
    }
    
    // タスクを表示
    async function showTask(taskKey) {
        const task = tasksData[taskKey];
        if (!task) return;
        
        const modal = document.getElementById('task-modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        
        modalTitle.textContent = `#${task.id} - ${task.name}`;
        // 編集ボタン群
        let toolbarHtml = '';
        if (apiAvailable) {
            toolbarHtml = '<div class="modal-toolbar" style="margin-bottom:8px; display:flex; gap:8px;">'
                + '<button id="edit-task-btn" class="btn">✏️ 編集</button>'
                + '</div>';
        }
        modalBody.innerHTML = toolbarHtml + '<div class="loading">読み込み中...</div>';
        
        modal.classList.add('active');
        
        try {
            const response = await fetch(task.path);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const markdown = await response.text();
            
            // XSSを防ぎながらMarkdown→HTML変換
            let html = escapeHtml(markdown);
            
            // 安全なマークダウン変換
            html = html
                .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
                .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
                .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
                .replace(/^-\s+(.+)$/gm, '<li>$1</li>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\[x\]/gi, '☑')
                .replace(/\[\s?\]/gi, '☐')
                .replace(/`([^`]+)`/g, '<code>$1</code>');
            
            // リストタグで囲む
            html = html.replace(/(<li>.*<\/li>)\n?/g, function(match) {
                return '<ul>' + match + '</ul>';
            });
            
            // 連続するulタグをマージ
            html = html.replace(/<\/ul>\n?<ul>/g, '');
            
            const contentHtml = `<div class="markdown-content">${html}</div>`;
            modalBody.innerHTML = toolbarHtml + contentHtml;
            // 編集ボタンのイベント
            if (apiAvailable) {
                const btn = document.getElementById('edit-task-btn');
                if (btn) {
                    btn.addEventListener('click', () => openEditForm(task));
                }
            }
            
        } catch (error) {
            modalBody.innerHTML = `<div class="error">タスクの読み込みに失敗しました: ${error.message}</div>`;
        }
    }

    // 編集フォームを開く
    async function openEditForm(task) {
        try {
            const res = await fetch(`/api/tasks/get?filename=${encodeURIComponent(task.file)}`);
            if (!res.ok) throw new Error(`GET failed: ${res.status}`);
            const data = await res.json();
            const modalBody = document.getElementById('modal-body');
            let author = (localStorage.getItem('authorName') || '').trim();
            if (!author) { author = 'kirara'; }
            const titleVal = data.title || task.name;
            const bodyVal = data.body || '';
            modalBody.innerHTML = `
                <div class="modal-toolbar">
                    <button id="save-task-btn" class="btn btn-primary">💾 保存 (⌘/Ctrl+S)</button>
                    <button id="cancel-edit-btn" class="btn">キャンセル (Esc)</button>
                </div>
                <div class="edit-form">
                    <div style="margin:10px 0;">
                        <label>タイトル</label>
                        <input id="edit-title" type="text" value="${escapeAttr(titleVal)}" />
                    </div>
                    <div style="margin:10px 0;">
                        <label>本文（Change Logより上の本文）</label>
                        <textarea id="edit-body">${escapeHtml(bodyVal)}</textarea>
                    </div>
                </div>
            `;
            document.getElementById('cancel-edit-btn').onclick = () => showTask(`${task.status}_${task.id}`);
            const doSave = async () => {
                try {
                    const title = document.getElementById('edit-title').value;
                    const body = document.getElementById('edit-body').value;
                    // 名前未設定でも既定の 'kirara' で続行
                    const payload = { filename: task.file, title, body, author, ifMatch: data.etag };
                    const saveBtn = document.getElementById('save-task-btn');
                    if (saveBtn) saveBtn.disabled = true;
                    const put = await fetch('/api/tasks/save', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (saveBtn) saveBtn.disabled = false;
                    if (!put.ok) {
                        let msg = `保存失敗 (${put.status})`;
                        try { const j = await put.json(); if (j && j.error) msg += `: ${j.error}`; } catch {}
                        alert(msg);
                        return;
                    }
                    await loadTasks();
                    const toastEl = document.getElementById('toast');
                    if (toastEl) { toastEl.textContent = '保存しました'; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'),1800); }
                    showTask(`${task.status}_${task.id}`);
                } catch (e) {
                    alert('保存に失敗しました\n' + (e?.message || ''));
                }
            };
            const saveBtnEl = document.getElementById('save-task-btn');
            if (saveBtnEl) saveBtnEl.onclick = doSave;
            const keyHandler = (ev) => {
                if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); doSave(); }
                if (ev.key === 'Escape') { ev.preventDefault(); showTask(`${task.status}_${task.id}`); }
            };
            document.addEventListener('keydown', keyHandler, { once: true });
        } catch (e) {
            alert('編集情報の取得に失敗しました');
        }
    }
    
    // モーダルを閉じる
    function closeModal() {
        const modal = document.getElementById('task-modal');
        modal.classList.remove('active');
    }
    
    // 検索機能の初期化
    function initSearch() {
        const searchBox = document.getElementById('search-box');
        const searchResults = document.getElementById('search-results');
        const searchModeToggle = document.getElementById('search-mode-toggle');
        
        if (!searchBox) return;
        
        // 検索モードトグル
        if (searchModeToggle) {
            searchModeToggle.addEventListener('click', () => {
                fullTextSearchEnabled = !fullTextSearchEnabled;
                searchModeToggle.textContent = fullTextSearchEnabled ? '🔍 全文検索' : '🔎 タイトル検索';
                searchModeToggle.classList.toggle('active', fullTextSearchEnabled);
                
                if (fullTextSearchEnabled && !searchIndexCache) {
                    loadSearchIndex();
                }
                
                if (searchBox.value) {
                    performSearch(searchBox.value);
                }
            });
        }
        
        // 検索ボックスのイベント
        searchBox.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                performSearch(query);
            }, 300);
        });
        
        searchBox.addEventListener('focus', showSearchHistory);
        searchBox.addEventListener('blur', () => {
            setTimeout(() => {
                const historyDropdown = document.querySelector('.search-history-dropdown');
                if (historyDropdown) {
                    historyDropdown.style.display = 'none';
                }
            }, 200);
        });
    }

    // DnD: 列のドロップ受け入れ
    function initDnDColumns() {
        ['backlog', 'todo', 'review', 'done'].forEach(status => {
            const listEl = document.getElementById(`${status}-list`);
            if (!listEl) return;
            listEl.addEventListener('dragover', (ev) => {
                ev.preventDefault();
            });
            listEl.addEventListener('dragenter', () => listEl.classList.add('droppable'));
            listEl.addEventListener('dragleave', () => listEl.classList.remove('droppable'));
            listEl.addEventListener('drop', async (ev) => {
                ev.preventDefault();
                listEl.classList.remove('droppable');
                try {
                    const raw = ev.dataTransfer.getData('text/plain');
                    if (!raw) return;
                    const data = JSON.parse(raw);
                    if (!data || !data.filename) return;
                    let author = (localStorage.getItem('authorName') || '').trim();
                    if (!author) { author = 'kirara'; }
                    if (data.fromStatus === status) return; // 変化なし
                    // API呼び出し
                    const res = await fetch('/api/tasks/status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename: data.filename, toStatus: status, author })
                    });
                    if (!res.ok) {
                        let msg = `API error (${res.status})`;
                        try { const j = await res.json(); if (j && j.error) msg += `: ${j.error}`; } catch {}
                        throw new Error(msg);
                    }
                    // サーバから新しいファイル名が返る（末尾ステータスでrename済み）
                    let latestFilename = data.filename;
                    try {
                        const jr = await res.json();
                        if (jr && jr.file) latestFilename = jr.file;
                    } catch {}
                    // 大きなスプラッシュを3秒表示
                    showStatusSplash(data.id, data.fromStatus, status);

                    // Offer undo for 120s
                    const toastEl = document.getElementById('toast');
                    if (toastEl) {
                        toastEl.innerHTML = 'ステータスを変更しました <button id="undo-last" class="btn" style="margin-left:8px;">元に戻す</button>';
                        toastEl.classList.add('show');
                        setTimeout(()=>toastEl.classList.remove('show'), 8000);
                        const undoBtn = document.getElementById('undo-last');
                        if (undoBtn) undoBtn.onclick = async () => {
                            try {
                                const uname = ((localStorage.getItem('authorName')||'').trim() || 'kirara');
                                const r = await fetch('/api/tasks/undo', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ filename: latestFilename, author: uname })});
                                if (!r.ok) { alert('Undoに失敗しました'); return; }
                                await loadTasks();
                            } catch {}
                        };
                    }
                    await loadTasks();
                } catch (e) {
                    console.error('DnD error:', e);
                    alert('ステータス変更に失敗しました\n' + (e?.message || '') + '\n\nサーバが起動しているか確認してください:\n npm run task-viewer');
                }
            });
        });
    }
    
    // 検索履歴を表示
    function showSearchHistory() {
        const historyDropdown = document.querySelector('.search-history-dropdown');
        if (!historyDropdown) return;
        
        if (searchHistory.length === 0) {
            historyDropdown.style.display = 'none';
            return;
        }
        
        historyDropdown.innerHTML = searchHistory.map(query => 
            `<div class="search-history-item" data-query="${escapeHtml(query)}">
                <span class="history-icon">🕐</span>
                <span class="history-text">${escapeHtml(query)}</span>
            </div>`
        ).join('');
        
        historyDropdown.style.display = 'block';
        
        // 履歴アイテムのクリックイベント
        historyDropdown.querySelectorAll('.search-history-item').forEach(item => {
            item.addEventListener('click', () => {
                const query = item.getAttribute('data-query');
                document.getElementById('search-box').value = query;
                performSearch(query);
                historyDropdown.style.display = 'none';
            });
        });
    }
    
    // 検索実行
    function performSearch(query) {
        const searchResults = document.getElementById('search-results');
        let matchCount = 0;
        
        if (!query) {
            allTaskCards.forEach(card => {
                card.element.classList.remove('search-hidden');
            });
            searchResults.classList.remove('active');
            startAutoUpdate();
            return;
        }
        
        stopAutoUpdate();
        
        allTaskCards.forEach(card => {
            const idMatch = card.id.includes(query) ||
                (card.idRaw && card.idRaw.includes(query)) ||
                (Array.isArray(card.aliases) && card.aliases.some(a => a.includes(query)));
            const titleMatch = card.title.includes(query);
            const statusMatch = card.status.includes(query);
            let contentMatch = false;
            
            // 全文検索が有効な場合
            if (fullTextSearchEnabled && searchIndexCache) {
                const taskData = searchIndexCache.tasks.find(t => t.filename === card.filename);
                if (taskData && taskData.content) {
                    contentMatch = taskData.content.toLowerCase().includes(query);
                }
            }
            
            if (idMatch || titleMatch || statusMatch || contentMatch) {
                card.element.classList.remove('search-hidden');
                matchCount++;
                highlightMatch(card, query);
                
                // 全文検索でマッチした場合、プレビューを表示
                if (contentMatch && searchIndexCache) {
                    const taskData = searchIndexCache.tasks.find(t => t.filename === card.filename);
                    if (taskData && taskData.content) {
                        const contentLower = taskData.content.toLowerCase();
                        const matchIndex = contentLower.indexOf(query);
                        if (matchIndex !== -1) {
                            const start = Math.max(0, matchIndex - 50);
                            const end = Math.min(taskData.content.length, matchIndex + query.length + 50);
                            const preview = '...' + taskData.content.substring(start, end) + '...';
                            
                            let previewEl = card.element.querySelector('.content-preview');
                            if (!previewEl) {
                                previewEl = document.createElement('div');
                                previewEl.className = 'content-preview';
                                card.element.appendChild(previewEl);
                            }
                            previewEl.innerHTML = safeHighlight(preview, query);
                        }
                    }
                }
            } else {
                card.element.classList.add('search-hidden');
                // プレビューを削除
                const previewEl = card.element.querySelector('.content-preview');
                if (previewEl) {
                    previewEl.remove();
                }
            }
        });
        
        if (matchCount > 0) {
            const modeText = fullTextSearchEnabled ? '（全文検索）' : '';
            searchResults.textContent = `${matchCount}件見つかりました ${modeText}`;
            searchResults.classList.add('active');
        } else {
            searchResults.textContent = '該当するタスクがありません';
            searchResults.classList.add('active');
        }
        
        if (query.length >= 2) {
            saveSearchHistory(query);
        }
    }
    
    // 検索インデックスを読み込む
    async function loadSearchIndex() {
        try {
            const response = await fetch(buildUrl('tasks_search.json'));
            if (response.ok) {
                searchIndexCache = await response.json();
            }
        } catch (error) {
            console.error('検索インデックスの読み込みエラー:', error);
        }
    }
    
    // ハイライト処理
    function highlightMatch(card, query) {
        const titleEl = card.element.querySelector('.task-title');
        const idEl = card.element.querySelector('.task-id');
        
        if (titleEl && card.title.includes(query)) {
            titleEl.innerHTML = safeHighlight(card.originalTitle, query);
        } else if (titleEl) {
            titleEl.textContent = card.originalTitle;
        }
        
        if (idEl && card.id.includes(query)) {
            idEl.innerHTML = safeHighlight(card.originalId, query);
        } else if (idEl) {
            idEl.textContent = card.originalId;
        }
    }
    
    // 安全なHTMLハイライト
    function safeHighlight(text, query) {
        const escapedText = escapeHtml(text);
        const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
        return escapedText.replace(regex, '<mark>$1</mark>');
    }
    
    // 検索履歴を保存
    function saveSearchHistory(query) {
        searchHistory = searchHistory.filter(q => q !== query);
        searchHistory.unshift(query);
        searchHistory = searchHistory.slice(0, 5);
        localStorage.setItem('taskSearchHistory', JSON.stringify(searchHistory));
    }
    
    // 自動更新を停止
    function stopAutoUpdate() {
        if (autoUpdateTimer) {
            clearInterval(autoUpdateTimer);
            autoUpdateTimer = null;
        }
    }
    
    // 自動更新を開始
    function startAutoUpdate() {
        stopAutoUpdate();
        console.log('Starting auto update - interval: 30000ms');
        autoUpdateTimer = setInterval(() => {
            console.log('Auto update triggered at:', new Date().toLocaleTimeString('ja-JP'));
            // キャッシュを無効化してリロード（フォールバック対応）
            fetch(buildUrl('/tasks.json') + '?t=' + Date.now())
                .then(r => r.ok ? r : fetch(buildUrl('tasks.json') + '?t=' + Date.now()))
                .then(() => loadTasks())
                .catch(err => console.error('Auto update error:', err));
        }, 30000);
    }

    // SSE接続を開始
    function startSSE() {
        try {
            if (!!window.EventSource) {
                sse = new EventSource('/events');
                sse.onmessage = (e) => {
                    try {
                        const data = JSON.parse(e.data || '{}');
                        if (data && (data.type === 'fs-change' || data.type === 'hello')) {
                            // 即時再読込
                            loadTasks();
                        }
                    } catch (err) {
                        // noop
                    }
                };
                sse.onerror = () => {
                    console.warn('SSE error. Falling back to polling.');
                    try { sse.close(); } catch (_) {}
                    sse = null;
                    startAutoUpdate();
                };
                console.log('SSE connected');
            } else {
                console.log('EventSource not supported. Using polling.');
                startAutoUpdate();
            }
        } catch (e) {
            console.warn('Failed to start SSE:', e);
            startAutoUpdate();
        }
    }
    
    // ユーティリティ関数
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function escapeAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }
    
    // 初期化
    async function initialize() {
        try {
            console.log('Initializing Task Viewer...');
            
            // モーダルのイベントリスナー
            const closeBtn = document.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', closeModal);
            }
            
            const modal = document.getElementById('task-modal');
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target.id === 'task-modal') {
                        closeModal();
                    }
                });
            }
            
            // API可用性チェック
            try {
                const ping = await fetch('/api/ping');
                apiAvailable = ping.ok;
                if (!apiAvailable) {
                    console.warn('API unavailable: DnD/編集は無効化');
                }
            } catch (e) {
                console.warn('API ping failed:', e);
                apiAvailable = false;
            }

            // 初回読み込み
            await loadTasks();
            console.log('Initial load completed');
            
            initSearch();
            console.log('Search initialized');
            
            // 手動再読込ボタン
            const refreshBtn = document.getElementById('manual-refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async () => {
                    await loadTasks();
                });
            }

            // 設定（名前・テーマ）
            const settingsToggle = document.getElementById('settings-toggle');
            const settingsModal = document.getElementById('settings-modal');
            const settingsClose = document.querySelector('.settings-close');
            const settingsTitle = document.getElementById('settings-title');
            const settingsName = document.getElementById('settings-author-name');
            const settingsThemeToggle = document.getElementById('settings-theme-toggle');
            const settingsThemeLabel = document.getElementById('settings-theme-label');
            const openSettings = () => {
                if (!settingsModal) return;
                // load title/name
                if (settingsTitle) {
                    const t = localStorage.getItem('viewerTitle') || 'Stop Midnight Task Viewer';
                    settingsTitle.value = t;
                }
                if (settingsName) {
                    const saved = localStorage.getItem('authorName') || 'kirara';
                    settingsName.value = saved;
                }
                const cur = document.documentElement.getAttribute('data-theme') || 'dark';
                if (settingsThemeLabel) settingsThemeLabel.textContent = cur === 'dark' ? '現在: ダーク' : '現在: ライト';
                settingsModal.classList.add('active');
            };
            const closeSettings = () => { if (settingsModal) settingsModal.classList.remove('active'); };
            if (settingsToggle && settingsModal) settingsToggle.addEventListener('click', openSettings);
            if (settingsClose && settingsModal) settingsClose.addEventListener('click', closeSettings);
            if (settingsModal) settingsModal.addEventListener('click', (e) => { if (e.target && e.target.id === 'settings-modal') closeSettings(); });
            if (settingsName) settingsName.addEventListener('input', () => { localStorage.setItem('authorName', settingsName.value.trim()); });
            if (settingsThemeToggle) settingsThemeToggle.addEventListener('click', () => {
                const cur = document.documentElement.getAttribute('data-theme') || 'dark';
                const next = cur === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                localStorage.setItem('theme', next);
                if (settingsThemeLabel) settingsThemeLabel.textContent = next === 'dark' ? '現在: ダーク' : '現在: ライト';
            });
            const settingsApply = document.getElementById('settings-apply');
            if (settingsApply) settingsApply.addEventListener('click', () => {
                const t = (settingsTitle?.value || '').trim() || 'Stop Midnight Task Viewer';
                localStorage.setItem('viewerTitle', t);
                const appTitleEl = document.getElementById('app-title');
                if (appTitleEl) appTitleEl.textContent = t;
                closeSettings();
            });

            // 初期タイトル反映
            const appTitleEl = document.getElementById('app-title');
            if (appTitleEl) {
                const t = localStorage.getItem('viewerTitle');
                if (t) appTitleEl.textContent = t;
            }

            // 変更履歴モーダル
            const historyToggle = document.getElementById('history-toggle');
            const activityModal = document.getElementById('activity-modal');
            const activityCloseBtn = document.querySelector('.activity-modal-close');
            async function loadActivity() {
                try {
                    const res = await fetch('/api/activity?limit=50');
                    if (!res.ok) throw new Error('activity error');
                    const list = await res.json();
                    const el = document.getElementById('activity-list');
                    const items = (list || []).filter(item => item && (item.ts || item.type || item.filename));
                    if (items.length === 0) {
                        el.innerHTML = '<div class="activity-item"><div class="meta">履歴はありません</div></div>';
                    } else {
                        el.innerHTML = items.map(item => {
                            const isoTs = item.ts || '';
                            // 表示はJSTに整形、内部計算はISOを使用
                            let ts = isoTs;
                            try {
                                ts = new Date(isoTs).toLocaleString('ja-JP', {
                                    timeZone: 'Asia/Tokyo',
                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                                });
                            } catch {}
                            const type = item.type || '';
                            const file = item.filename || '';
                            const who = item.author || '';
                            let detail = '';
                            if (type === 'status') detail = `${item.from} → ${item.to}`;
                            if (type === 'save') detail = `edited: ${(item.fields||[]).join(', ')}`;
                        const meta = [ts, who, type].filter(Boolean).join(' • ');
                        const main = [file, detail].filter(Boolean).join('  ');
                        let undoBtn = '';
                        // 自分のstatus変更で120秒以内のみUndo表示
                        try {
                            const my = (localStorage.getItem('authorName')||'').trim();
                            const age = Date.now() - Date.parse(isoTs||0);
                            if (type==='status' && who===my && age>=0 && age<=120000) {
                                undoBtn = `<button class="btn" data-undo="${encodeURIComponent(file)}" style="float:right;">元に戻す</button>`;
                            }
                        } catch {}
                        return `<div class="activity-item"><div class="meta">${meta}</div><div>${main} ${undoBtn}</div></div>`;
                        }).join('');
                        // bind undo buttons
                        document.querySelectorAll('[data-undo]').forEach(el => {
                            el.addEventListener('click', async () => {
                                const fname = decodeURIComponent(el.getAttribute('data-undo'));
                                const uname = (localStorage.getItem('authorName')||'').trim();
                                const r = await fetch('/api/tasks/undo', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ filename: fname, author: uname })});
                                if (!r.ok) { alert('Undoに失敗しました'); return; }
                                await loadTasks();
                                await loadActivity();
                            });
                        });
                    }
                } catch (e) {
                    console.warn('activity load failed');
                }
            }
            if (historyToggle && activityModal) {
                historyToggle.addEventListener('click', async () => {
                    activityModal.classList.add('active');
                    await loadActivity();
                });
            }
            if (activityCloseBtn && activityModal) {
                activityCloseBtn.addEventListener('click', () => activityModal.classList.remove('active'));
            }
            if (activityModal) {
                activityModal.addEventListener('click', (e) => {
                    if (e.target && e.target.id === 'activity-modal') {
                        activityModal.classList.remove('active');
                    }
                });
            }
            document.addEventListener('keydown', (ev) => {
                if (ev.key === 'Escape' && activityModal && activityModal.classList.contains('active')) {
                    activityModal.classList.remove('active');
                }
            });

            // 新規タスクモーダル
            const newTaskToggle = document.getElementById('new-task-toggle');
            const newTaskModal = document.getElementById('new-task-modal');
            const newTaskClose = document.querySelector('.new-task-close');
            const openNewTask = () => { if (newTaskModal) newTaskModal.classList.add('active'); };
            const closeNewTask = () => { if (newTaskModal) newTaskModal.classList.remove('active'); };
            if (newTaskToggle && newTaskModal) newTaskToggle.addEventListener('click', openNewTask);
            if (newTaskClose && newTaskModal) newTaskClose.addEventListener('click', closeNewTask);
            if (newTaskModal) {
                newTaskModal.addEventListener('click', (e) => { if (e.target && e.target.id === 'new-task-modal') closeNewTask(); });
            }
            // テンプレート適用（外部ファイル: docs/logs/templates/*.md）

            // テンプレート適用（外部ファイル）
            const tplSelect = document.getElementById('new-task-template');
            let fetchedTemplates = [];
            let lastTpl = { id: null, prefix: '', body: '' };
            async function loadTemplates() {
                try {
                    const res = await fetch('/api/templates');
                    if (!res.ok) return;
                    fetchedTemplates = await res.json();
                    if (tplSelect) {
                        const keep = Array.from(tplSelect.options).filter(o => o.value === 'custom');
                        tplSelect.innerHTML = '';
                        keep.forEach(o => tplSelect.appendChild(o));
                        fetchedTemplates.forEach(t => {
                            const opt = document.createElement('option');
                            opt.value = t.id;
                            opt.textContent = t.name || t.id;
                            tplSelect.appendChild(opt);
                        });
                    }
                } catch {}
            }
            await loadTemplates();
            function applyTemplate(tpl, force=false) {
                if (!tpl) return;
                const tInput = document.getElementById('new-task-title');
                const bInput = document.getElementById('new-task-body');
                const sInput = document.getElementById('new-task-status');
                const prefix = tpl.prefix || '';
                if (tInput) {
                    const cur = tInput.value || '';
                    if (lastTpl.prefix && cur.startsWith(lastTpl.prefix)) {
                        tInput.value = prefix + cur.slice(lastTpl.prefix.length);
                    } else if (prefix && !cur.startsWith(prefix)) {
                        tInput.value = prefix + cur;
                    }
                }
                if (bInput) {
                    const curBody = (bInput.value || '').trim();
                    const lastBody = (lastTpl.body || '').trim();
                    if (force || curBody === '' || curBody === lastBody) {
                        bInput.value = tpl.body || '';
                    }
                }
                if (sInput && tpl.status && ['backlog','todo','review','done'].includes(tpl.status)) {
                    sInput.value = tpl.status;
                }
                lastTpl = { id: tpl.id, prefix, body: tpl.body || '' };
            }
            if (tplSelect) {
                tplSelect.addEventListener('change', () => {
                    const id = tplSelect.value;
                    const tpl = fetchedTemplates.find(x => x.id === id);
                    if (!tpl) return; // custom
                    applyTemplate(tpl, false);
                });
            }
            const applyTplBtn = document.getElementById('new-task-apply-template');
            if (applyTplBtn) applyTplBtn.addEventListener('click', () => {
                const id = tplSelect?.value;
                const tpl = fetchedTemplates.find(x => x.id === id);
                if (tpl) applyTemplate(tpl, true);
            });

            const saveNewTask = async () => {
                try {
                    const title = (document.getElementById('new-task-title')?.value || '').trim();
                    const body = document.getElementById('new-task-body')?.value || '';
                    const status = document.getElementById('new-task-status')?.value || 'todo';
                    const author = ((localStorage.getItem('authorName') || '').trim() || 'kirara');
                    if (!title) { alert('タイトルを入力してください'); return; }
                    const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body, status, author }) });
                    if (!res.ok) {
                        let msg = `作成に失敗しました (${res.status})`;
                        try { const j = await res.json(); if (j && j.error) msg += `: ${j.error}`; } catch {}
                        alert(msg); return;
                    }
                    await loadTasks();
                    const toastEl = document.getElementById('toast');
                    if (toastEl) { toastEl.textContent = 'タスクを作成しました'; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'),1800); }
                    closeNewTask();
                } catch (e) {
                    alert('作成に失敗しました');
                }
            };
            const newTaskSaveBtn = document.getElementById('new-task-save');
            if (newTaskSaveBtn) newTaskSaveBtn.addEventListener('click', saveNewTask);

            // DnD列初期化（APIが使える場合のみ）
            if (apiAvailable) initDnDColumns();

            // SSE優先、不可ならポーリング
            startSSE();
            
            console.log('Initialization completed successfully');
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }
    
    // 初期化実行
    initialize();
    
    // Public API
    window.TaskViewer = {
        refresh: loadTasks,
        search: performSearch,
        openTask: showTask
    };
    
})();
