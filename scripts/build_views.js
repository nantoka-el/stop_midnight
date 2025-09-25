#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TASKS_DIR = path.join(__dirname, '..', 'docs', 'logs', 'tasks');
const VIEWS_DIR = path.join(__dirname, '..', 'docs', 'logs', '.views');

const statuses = ['backlog', 'todo', 'review', 'done'];

if (fs.existsSync(VIEWS_DIR)) {
  fs.rmSync(VIEWS_DIR, { recursive: true, force: true });
}

statuses.forEach((status, index) => {
  const viewDir = path.join(VIEWS_DIR, `${index + 1}_${status.toUpperCase()}`);
  fs.mkdirSync(viewDir, { recursive: true });

  const files = fs.existsSync(TASKS_DIR)
    ? fs.readdirSync(TASKS_DIR).filter(file => (
        file.endsWith(`_${status}.md`) && !file.startsWith('STATE') && !file.startsWith('INDEX')
      ))
    : [];

  files.forEach(file => {
    const target = path.join('..', '..', 'tasks', file);
    const link = path.join(viewDir, file);
    try { fs.symlinkSync(target, link); } catch (error) {
      console.error(`Failed to create symlink for ${file}:`, error.message);
    }
  });

  console.log(`Created ${files.length} links in ${status.toUpperCase()}`);
});

console.log(`Views created in ${VIEWS_DIR}`);
console.log('Open the .views folder in your file explorer to see tasks by status');

