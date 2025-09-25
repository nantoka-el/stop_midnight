#!/usr/bin/env node
/**
 * Lightweight static server + SSE for docs/logs viewer (Stop Midnight Task Viewer)
 * - Serves a document root (default: ./docs/logs) with Cache-Control: no-store
 * - Provides Server-Sent Events at /events broadcasting filesystem changes
 * - Simple JSON APIs under /api for status change and activity feed
 * - Fallback support for viewer assets: set ALT_VIEWER_ROOT to reuse kiracle's viewer files
 *
 * Usage:
 *   node scripts/task-viewer-server.js --port 7777 --root ./docs/logs
 *   TASK_VIEWER_PORT=7777 TASK_VIEWER_ROOT=./docs/logs node scripts/task-viewer-server.js
 *   ALT_VIEWER_ROOT=../kiracle/docs/logs node scripts/task-viewer-server.js --port 7777 --root ./docs/logs
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--port') out.port = parseInt(args[++i], 10);
    else if (a === '--root') out.root = args[++i];
  }
  return out;
}

const args = parseArgs();
const PORT = args.port || parseInt(process.env.TASK_VIEWER_PORT || '7777', 10);
const DOC_ROOT = path.resolve(args.root || process.env.TASK_VIEWER_ROOT || path.join(__dirname, '..', 'docs', 'logs'));
const ALT_VIEWER_ROOT = process.env.ALT_VIEWER_ROOT || process.env.FALLBACK_VIEWER_ROOT || process.env.KIRACLE_VIEWER_ROOT || '';
const TASKS_DIR = path.join(DOC_ROOT, 'tasks');
const VALID_STATUSES = new Set(['backlog', 'todo', 'review', 'done']);
const undoStore = new Map();

function ensureTasksDir() {
  fs.mkdirSync(TASKS_DIR, { recursive: true });
}

function formatDate() {
  return new Date().toISOString().slice(0, 10);
}

function pad4(value) {
  return String(value).padStart(4, '0');
}

function slugify(text) {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'task';
}

function runGenerators() {
  try { spawnSync('node', [path.join(__dirname, 'build_views.js')], { stdio: 'ignore' }); } catch {}
  try { spawnSync('node', [path.join(__dirname, 'generate_tasks_json.js')], { stdio: 'ignore' }); } catch {}
  try { spawnSync('node', [path.join(__dirname, 'gen_index.js')], { stdio: 'ignore' }); } catch {}
}

function computeEtag(stat) {
  return `${stat.mtimeMs}-${stat.size}`;
}

function parseTaskFile(content) {
  const lines = content.split('\n');
  const titleLine = lines[0] || '';
  const titleMatch = titleLine.match(/^#\s*(.+)$/);
  let rawTitle = titleMatch ? titleMatch[1].trim() : '';
  let idPart = '';
  let cleanTitle = rawTitle;
  const idMatch = rawTitle.match(/^([0-9]+[a-z]?):\s*(.*)$/);
  if (idMatch) {
    idPart = idMatch[1];
    cleanTitle = idMatch[2].trim();
  }

  let index = 1;
  while (index < lines.length && lines[index].trim() === '') index++;

  const metaStart = index;
  while (index < lines.length && /^[A-Za-z0-9_-]+:\s/.test(lines[index])) index++;
  const metaEnd = index;

  while (index < lines.length && lines[index].trim() === '') index++;
  const bodyStart = index;

  let changeLogIdx = lines.findIndex((line, i) => i >= bodyStart && line.trim() === '---');
  if (changeLogIdx === -1) changeLogIdx = lines.length;

  const bodyLines = lines.slice(bodyStart, changeLogIdx);
  const body = bodyLines.join('\n').trimEnd();
  const metaLines = lines.slice(metaStart, metaEnd);

  const changeLines = changeLogIdx < lines.length ? lines.slice(changeLogIdx) : [];

  return {
    idPart,
    cleanTitle,
    metaLines,
    body,
    changeLines,
  };
}

function normaliseChangeLog(changeLines) {
  if (!changeLines || changeLines.length === 0) {
    return ['---', 'Change Log'];
  }
  const lines = [...changeLines];
  if (lines[0].trim() !== '---') {
    lines.unshift('---');
  }
  if (lines.length < 2 || lines[1].trim().toLowerCase() !== 'change log') {
    lines.splice(1, 0, 'Change Log');
  }
  return lines;
}

function rebuildTaskContent({
  idPart,
  title,
  metaLines,
  body,
  editedBy,
  changeLines,
  changeLogEntry,
}) {
  const lines = [];
  const heading = idPart ? `# ${idPart}: ${title}` : `# ${title}`;
  lines.push(heading);
  lines.push('');

  const filteredMeta = metaLines.filter(line => !line.startsWith('Edited-By:'));
  if (filteredMeta.length > 0) {
    lines.push(...filteredMeta);
  }
  lines.push(`Edited-By: ${editedBy}`);
  lines.push('');

  if (body) {
    lines.push(body.trimEnd());
    lines.push('');
  }

  const normalised = normaliseChangeLog(changeLines);
  if (changeLogEntry) {
    normalised.push(changeLogEntry);
  }

  lines.push(...normalised);
  const output = lines.join('\n').replace(/\n\n+$/g, '\n');
  return output.endsWith('\n') ? output : `${output}\n`;
}

function nextTaskId() {
  ensureTasksDir();
  const files = fs.readdirSync(TASKS_DIR).filter(name => name.endsWith('.md'));
  let max = 0;
  for (const file of files) {
    const match = file.match(/^(\d+)/);
    if (match) {
      const value = parseInt(match[1], 10);
      if (!Number.isNaN(value) && value > max) max = value;
    }
  }
  return pad4(max + 1);
}

function respondJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
}

function storeUndoEntry(key, entry) {
  undoStore.set(key, { ...entry, expires: Date.now() + 120000 });
}

function popUndoEntry(key) {
  const record = undoStore.get(key);
  if (!record) return null;
  if (record.expires < Date.now()) {
    undoStore.delete(key);
    return null;
  }
  undoStore.delete(key);
  return record;
}

function parseJsonBody(req, res, handler) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 1_000_000) {
      respondJson(res, 413, { error: 'payload too large' });
      req.destroy();
    }
  });
  req.on('end', () => {
    try {
      const data = body ? JSON.parse(body) : {};
      handler(data);
    } catch (e) {
      respondJson(res, 400, { error: 'invalid json' });
    }
  });
}

const sseClients = new Set();
function sendEvent(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch (e) { /* ignore */ }
  }
}

function appendActivity(entry) {
  try {
    const logPath = path.join(DOC_ROOT, 'activity.log');
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (e) {
    console.warn('activity log append failed:', e.message);
  }
}

// Keepalive pings to prevent intermediaries/timeouts
setInterval(() => {
  if (sseClients.size > 0) {
    try { sendEvent({ type: 'ping', ts: Date.now() }); } catch {}
  }
}, 25000);

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      return res.end('Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = (
      ext === '.html' ? 'text/html; charset=utf-8' :
      ext === '.js' ? 'text/javascript; charset=utf-8' :
      ext === '.css' ? 'text/css; charset=utf-8' :
      ext === '.json' ? 'application/json; charset=utf-8' :
      ext === '.md' ? 'text/markdown; charset=utf-8' :
      'application/octet-stream'
    );
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'no-store');
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  // CORS preflight for API
  if (req.method === 'OPTIONS' && parsed.pathname?.startsWith('/api/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, PUT, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }
  if (parsed.pathname === '/events') {
    // SSE endpoint
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ type: 'hello', ts: Date.now() })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Simple API: health
  if (req.method === 'GET' && parsed.pathname === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // Activity feed (recent)
  if (req.method === 'GET' && parsed.pathname === '/api/activity') {
    try {
      const limit = Math.max(1, Math.min(500, parseInt(parsed.query?.limit || '50', 10)));
      const logPath = path.join(DOC_ROOT, 'activity.log');
      if (!fs.existsSync(logPath)) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify([]));
      }
      const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
      const items = lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } }).reverse();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify(items));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  if (req.method === 'GET' && parsed.pathname === '/api/templates') {
    const templates = [
      {
        id: 'default',
        name: '基本タスク',
        prefix: '',
        status: 'todo',
        body: '- 概要:\n- 受け入れ基準:\n',
      },
    ];
    return respondJson(res, 200, templates);
  }

  if (req.method === 'GET' && parsed.pathname === '/api/tasks/get') {
    const filename = parsed.query?.filename;
    if (!filename || typeof filename !== 'string') {
      return respondJson(res, 400, { error: 'filename is required' });
    }
    ensureTasksDir();
    const filePath = path.join(TASKS_DIR, filename);
    if (!filePath.startsWith(TASKS_DIR) || !fs.existsSync(filePath)) {
      return respondJson(res, 404, { error: 'task not found' });
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const stat = fs.statSync(filePath);
      const parsedTask = parseTaskFile(content);
      return respondJson(res, 200, {
        title: parsedTask.cleanTitle,
        body: parsedTask.body,
        etag: computeEtag(stat),
      });
    } catch (e) {
      return respondJson(res, 500, { error: e.message });
    }
  }

  if (req.method === 'PUT' && parsed.pathname === '/api/tasks/save') {
    return parseJsonBody(req, res, payload => {
      const { filename, title, body = '', author = 'kirara', ifMatch } = payload || {};
      if (!filename || typeof filename !== 'string') {
        return respondJson(res, 400, { error: 'filename is required' });
      }
      if (!title || typeof title !== 'string') {
        return respondJson(res, 400, { error: 'title is required' });
      }
      ensureTasksDir();
      const filePath = path.join(TASKS_DIR, filename);
      if (!filePath.startsWith(TASKS_DIR) || !fs.existsSync(filePath)) {
        return respondJson(res, 404, { error: 'task not found' });
      }
      try {
        const stat = fs.statSync(filePath);
        const currentEtag = computeEtag(stat);
        if (ifMatch && ifMatch !== currentEtag) {
          return respondJson(res, 409, { error: 'etag mismatch', etag: currentEtag });
        }

        const original = fs.readFileSync(filePath, 'utf-8');
        const parsedTask = parseTaskFile(original);
        const today = formatDate();
        const newContent = rebuildTaskContent({
          idPart: parsedTask.idPart || (filename.match(/^(\d+[a-z]?)/)?.[1] || ''),
          title: title.trim(),
          metaLines: parsedTask.metaLines,
          body: String(body || '').trimEnd(),
          editedBy: `${author} ${today}`,
          changeLines: parsedTask.changeLines,
          changeLogEntry: `- ${today} ${author}: 本文を更新`,
        });

        fs.writeFileSync(filePath, newContent, 'utf-8');
        runGenerators();
        sendEvent({ type: 'fs-change', path: filePath, ts: Date.now() });
        appendActivity({ ts: new Date().toISOString(), type: 'save', filename, author, fields: ['title', 'body'] });

        const newStat = fs.statSync(filePath);
        return respondJson(res, 200, { ok: true, etag: computeEtag(newStat) });
      } catch (e) {
        return respondJson(res, 500, { error: e.message });
      }
    });
  }

  if (req.method === 'POST' && parsed.pathname === '/api/tasks') {
    return parseJsonBody(req, res, payload => {
      const { title, body = '', status = 'todo', author = 'kirara' } = payload || {};
      if (!title || typeof title !== 'string') {
        return respondJson(res, 400, { error: 'title is required' });
      }
      if (!VALID_STATUSES.has(status)) {
        return respondJson(res, 400, { error: 'invalid status' });
      }
      ensureTasksDir();
      try {
        const idPart = nextTaskId();
        const baseSlug = slugify(title);
        let slug = baseSlug;
        let filename = `${idPart}_${slug}_${status}.md`;
        let counter = 1;
        while (fs.existsSync(path.join(TASKS_DIR, filename))) {
          slug = `${baseSlug}-${counter}`;
          filename = `${idPart}_${slug}_${status}.md`;
          counter += 1;
        }
        const today = formatDate();
        const content = rebuildTaskContent({
          idPart,
          title: title.trim(),
          metaLines: [`Author: ${author}`],
          body: String(body || '').trimEnd(),
          editedBy: `${author} ${today}`,
          changeLines: ['---', 'Change Log'],
          changeLogEntry: `- ${today} ${author}: 作成`,
        });

        const filePath = path.join(TASKS_DIR, filename);
        fs.writeFileSync(filePath, content, 'utf-8');
        runGenerators();
        sendEvent({ type: 'fs-change', path: filePath, ts: Date.now() });
        appendActivity({ ts: new Date().toISOString(), type: 'create', filename, author, status });

        return respondJson(res, 200, { ok: true, id: idPart, filename, status });
      } catch (e) {
        return respondJson(res, 500, { error: e.message });
      }
    });
  }

  if (req.method === 'POST' && parsed.pathname === '/api/tasks/undo') {
    return parseJsonBody(req, res, payload => {
      const { filename, author = 'kirara' } = payload || {};
      if (!filename || typeof filename !== 'string') {
        return respondJson(res, 400, { error: 'filename is required' });
      }
      const entry = popUndoEntry(filename);
      if (!entry) {
        return respondJson(res, 404, { error: 'undo entry not found' });
      }
      try {
        ensureTasksDir();
        if (entry.kind === 'status') {
          const newPath = path.join(TASKS_DIR, entry.newFilename);
          if (fs.existsSync(newPath)) {
            fs.unlinkSync(newPath);
          }
          const previousPath = path.join(TASKS_DIR, entry.previousFilename);
          fs.writeFileSync(previousPath, entry.previousContent, 'utf-8');
          runGenerators();
          sendEvent({ type: 'fs-change', path: previousPath, ts: Date.now() });
          appendActivity({ ts: new Date().toISOString(), type: 'undo', filename: entry.previousFilename, author });
          return respondJson(res, 200, { ok: true, filename: entry.previousFilename });
        }
        return respondJson(res, 400, { error: 'unsupported undo operation' });
      } catch (e) {
        return respondJson(res, 500, { error: e.message });
      }
    });
  }

  // Change status via filename (compatible with kiracle)
  if (req.method === 'POST' && parsed.pathname === '/api/tasks/status') {
    return parseJsonBody(req, res, payload => {
      const { filename, toStatus, author = 'shirasu-viewer' } = payload || {};
      if (!filename || typeof filename !== 'string') {
        return respondJson(res, 400, { error: 'filename is required' });
      }
      if (!toStatus || typeof toStatus !== 'string' || !VALID_STATUSES.has(toStatus)) {
        return respondJson(res, 400, { error: 'invalid toStatus' });
      }
      ensureTasksDir();
      const fromPath = path.join(TASKS_DIR, filename);
      if (!fromPath.startsWith(TASKS_DIR) || !fs.existsSync(fromPath)) {
        return respondJson(res, 404, { error: 'task not found' });
      }
      const match = filename.match(/^(.*)_([^_]+)\.md$/);
      if (!match) {
        return respondJson(res, 400, { error: 'invalid filename format' });
      }
      const base = match[1];
      const fromStatus = match[2];
      if (fromStatus === toStatus) {
        return respondJson(res, 200, { ok: true, file: filename });
      }
      const toFilename = `${base}_${toStatus}.md`;
      const toPath = path.join(TASKS_DIR, toFilename);

      try {
        const originalContent = fs.readFileSync(fromPath, 'utf-8');
        const parsedTask = parseTaskFile(originalContent);
        const today = formatDate();
        const content = rebuildTaskContent({
          idPart: parsedTask.idPart || (base.match(/^(\d+[a-z]?)/)?.[1] || ''),
          title: parsedTask.cleanTitle,
          metaLines: parsedTask.metaLines,
          body: parsedTask.body,
          editedBy: `${author} ${today}`,
          changeLines: parsedTask.changeLines,
          changeLogEntry: `- ${today} ${author}: ステータス ${fromStatus} → ${toStatus}`,
        });

        fs.writeFileSync(toPath, content, 'utf-8');
        fs.unlinkSync(fromPath);

        storeUndoEntry(toFilename, {
          kind: 'status',
          previousFilename: filename,
          previousContent: originalContent,
          newFilename: toFilename,
        });

        runGenerators();
        appendActivity({ ts: new Date().toISOString(), type: 'status', author, filename: toFilename, prevFilename: filename, from: fromStatus, to: toStatus });
        sendEvent({ type: 'fs-change', path: toPath, ts: Date.now() });
        return respondJson(res, 200, { ok: true, file: toFilename });
      } catch (e) {
        return respondJson(res, 500, { error: e.message });
      }
    });
  }

  // Map request to DOC_ROOT; fallback to ALT_VIEWER_ROOT for /viewer/* assets
  let reqPath = decodeURIComponent(parsed.pathname || '/');
  if (reqPath === '/') reqPath = '/viewer/index.html';
  const safePath = path.normalize(reqPath).replace(/^\/+/, '');
  let filePath = path.join(DOC_ROOT, safePath);
  // Prevent path traversal for primary root
  if (!filePath.startsWith(DOC_ROOT)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  if (safePath === '.taskconfig.json' && !fs.existsSync(filePath)) {
    return respondJson(res, 200, {
      statuses: [
        { key: 'backlog', label: 'BACKLOG', color: '#6b7280' },
        { key: 'todo', label: 'TODO', color: '#3b82f6' },
        { key: 'review', label: 'REVIEW', color: '#eab308' },
        { key: 'done', label: 'DONE', color: '#22c55e' },
      ],
    });
  }
  // If missing locally and under /viewer, try ALT root
  if (!fs.existsSync(filePath) && safePath.startsWith('viewer/') && ALT_VIEWER_ROOT) {
    const altRoot = path.resolve(ALT_VIEWER_ROOT);
    const altFilePath = path.join(altRoot, safePath);
    if (fs.existsSync(altFilePath)) {
      return serveFile(req, res, altFilePath);
    }
  }
  serveFile(req, res, filePath);
});

// Watch target paths for changes and broadcast
function watchAndBroadcast() {
  const targets = [
    DOC_ROOT,
    path.join(DOC_ROOT, 'tasks'),
    path.join(DOC_ROOT, 'tasks.json'),
    path.join(DOC_ROOT, 'INDEX.md')
  ];
  const seen = new Set();
  let regenTimer = null;
  function regenerateArtifacts(reasonPath) {
    try {
      // 再生成（.views / tasks.json / INDEX.md）
      runGenerators();
      appendActivity({ ts: new Date().toISOString(), type: 'regen', reason: 'fs-change', path: reasonPath });
    } catch (e) {
      console.warn('auto-regenerate failed:', e.message);
    }
  }

  function onChange(evt, p) {
    const now = Date.now();
    const key = `${p}:${Math.floor(now/500)}`; // basic throttle window
    if (seen.has(key)) return;
    seen.add(key);
    // 変更通知
    sendEvent({ type: 'fs-change', path: p, ts: now });

    // tasks/配下のMD追加・削除・更新を検出した場合は自動再生成（500msデバウンス）
    try {
      const rel = p.startsWith(DOC_ROOT) ? p.slice(DOC_ROOT.length + 1) : p;
      const isTaskMd = rel && rel.startsWith('tasks') && /\.md$/i.test(rel);
      if (isTaskMd) {
        if (regenTimer) clearTimeout(regenTimer);
        regenTimer = setTimeout(() => regenerateArtifacts(p), 500);
      }
    } catch {}
  }
  targets.forEach(t => {
    try {
      const stat = fs.existsSync(t) ? fs.statSync(t) : null;
      if (!stat) return;
      if (stat.isDirectory()) {
        fs.watch(t, { recursive: false }, (evt, fname) => {
          if (!fname) return;
          const p = path.join(t, fname);
          onChange(evt, p);
        });
      } else {
        fs.watchFile(t, { interval: 500 }, () => onChange('change', t));
      }
    } catch (e) {
      console.warn('watch error:', t, e.message);
    }
  });
}

server.listen(PORT, () => {
  console.log(`📄 Stop Midnight Task Viewer running on http://localhost:${PORT}/viewer/index.html`);
  console.log(`🔎 Root: ${DOC_ROOT}`);
  if (ALT_VIEWER_ROOT) console.log(`🪄 Using ALT_VIEWER_ROOT for /viewer/*: ${path.resolve(ALT_VIEWER_ROOT)}`);
  watchAndBroadcast();
});
