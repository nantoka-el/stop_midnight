#!/usr/bin/env node
/**
 * Generate tasks.json from task files (Shirasu)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TASKS_DIR = path.join(__dirname, '..', 'docs', 'logs', 'tasks');
const OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'logs', 'tasks.json');
const VIEWER_OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'logs', 'viewer', 'tasks.json');

// Zero-pad to 4 digits
function pad4(n) {
  const s = String(n);
  return s.padStart(4, '0');
}

// Extract task info from filename and content
function extractTaskInfo(filename, content) {
  const lines = content.split('\n');
  const taskIdRawPart = filename.match(/^(\d+[a-z]?)_/)?.[1] || '';
  const status = filename.match(/_([^_]+)\.md$/)?.[1] || '';
  // Numeric part only (drop any trailing letter like 'a')
  const numericMatch = taskIdRawPart.match(/^(\d+)/);
  const idDigits = numericMatch ? numericMatch[1] : '';
  const letterSuffix = taskIdRawPart.slice(idDigits.length); // e.g., 'a' or ''
  const idRaw = idDigits.replace(/^0+/, '') || (idDigits ? '0' : '');
  const idPadded = idDigits ? (pad4(idDigits) + letterSuffix) : (taskIdRawPart || '');

  // Get title from first H1
  const titleLine = lines.find(line => line.startsWith('# '));
  let title = '';
  if (titleLine) {
    title = titleLine
      .replace(/^#\s*/, '')
      .replace(/^タスク\d+:\s*/, '')
      .replace(/^(TODO|REVIEW|DONE|BACKLOG)\s+\d+:\s*/, '')
      .replace(/^\d+:\s*/, '')
      .trim();
  } else {
    // Fallback to filename without extension and status
    title = filename
      .replace('.md', '')
      .replace(/_([^_]+)$/, '')
      .replace(/^\d+_/, '');
  }

  const task = {
    id: idPadded || taskIdRawPart || '',
    idRaw: idRaw || (idDigits || ''),
    aliases: [],
    title: title,
    status: status,
    filename: filename
  };
  if (task.id && task.idRaw && task.id !== task.idRaw) {
    task.aliases.push(task.idRaw);
  }
  return task;
}

function generateTasksJson() {
  try {
    if (!fs.existsSync(TASKS_DIR)) {
      fs.mkdirSync(TASKS_DIR, { recursive: true });
    }
    const files = fs.readdirSync(TASKS_DIR).filter(f => f.endsWith('.md'));

    const tasks = files.map(file => {
      const content = fs.readFileSync(path.join(TASKS_DIR, file), 'utf-8');
      return extractTaskInfo(file, content);
    }).sort((a, b) => {
      const ai = parseInt(a.id.replace(/\D/g, '') || '0', 10);
      const bi = parseInt(b.id.replace(/\D/g, '') || '0', 10);
      return ai - bi;
    });

    const json = JSON.stringify(tasks, null, 2);
    fs.writeFileSync(OUTPUT_FILE, json);
    // Also copy to viewer/
    try {
      fs.mkdirSync(path.dirname(VIEWER_OUTPUT_FILE), { recursive: true });
      fs.writeFileSync(VIEWER_OUTPUT_FILE, json);
    } catch (e) {
      console.warn('⚠️ Failed to write viewer/tasks.json:', e.message);
    }
    console.log(`✅ Generated tasks.json with ${tasks.length} tasks (also copied to viewer/)`);
  } catch (error) {
    console.error('Error generating tasks.json:', error);
    process.exit(1);
  }
}

generateTasksJson();

