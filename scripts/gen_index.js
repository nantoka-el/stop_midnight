#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TASKS_DIR = path.join(__dirname, '..', 'docs', 'logs', 'tasks');
const INDEX_FILE = path.join(__dirname, '..', 'docs', 'logs', 'INDEX.md');

const files = (fs.existsSync(TASKS_DIR) ? fs.readdirSync(TASKS_DIR) : [])
  .filter(f => 
    f.endsWith('.md') && 
    !f.startsWith('STATE') && 
    !f.startsWith('INDEX') &&
    !f.startsWith('000_') &&
    !f.includes('/_archive/')
  );

function createSection(title, suffix) {
  const sectionFiles = files.filter(f => f.endsWith(`_${suffix}.md`));
  if (sectionFiles.length === 0) return '';
  let section = `## ${title} (${sectionFiles.length})\n\n`;
  sectionFiles.sort().forEach(file => {
    try {
      const content = fs.readFileSync(path.join(TASKS_DIR, file), 'utf8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : file.replace(/_/g, ' ').replace('.md', '');
      section += `- **${title}** - [${file}](./tasks/${file})\n`;
    } catch (error) {
      section += `- [${file.replace(/_/g, ' ')}](./tasks/${file})\n`;
    }
  });
  section += '\n';
  return section;
}

function createCategorySection(title, prefix) {
  const categoryFiles = files.filter(f => f.startsWith(`${prefix}_`));
  if (categoryFiles.length === 0) return '';
  let section = `## ${title} (${categoryFiles.length})\n\n`;
  const byStatus = {
    backlog: categoryFiles.filter(f => f.endsWith('_backlog.md')),
    todo: categoryFiles.filter(f => f.endsWith('_todo.md')),
    review: categoryFiles.filter(f => f.endsWith('_review.md')),
    done: categoryFiles.filter(f => f.endsWith('_done.md'))
  };
  Object.entries(byStatus).forEach(([status, statusFiles]) => {
    if (statusFiles.length > 0) {
      section += `### ${status.toUpperCase()} (${statusFiles.length})\n`;
      statusFiles.sort().forEach(file => {
        const slug = file.replace(/_/g, ' ').replace('.md', '');
        section += `- [${slug}](./tasks/${file})\n`;
      });
      section += '\n';
    }
  });
  return section;
}

let content = `# Logs INDEX\n*自動生成: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}*\n\n` +
`## 📊 サマリー\n` +
`- BACKLOG: ${files.filter(f => f.endsWith('_backlog.md')).length}件\n` +
`- TODO: ${files.filter(f => f.endsWith('_todo.md')).length}件\n` +
`- REVIEW: ${files.filter(f => f.endsWith('_review.md')).length}件\n` +
`- DONE: ${files.filter(f => f.endsWith('_done.md')).length}件\n` +
`- 合計: ${files.length}件\n\n`;

content += createSection('📑 BACKLOG', 'backlog');
content += createSection('📝 TODO', 'todo');
content += createSection('🔍 REVIEW', 'review');
content += createSection('✅ DONE', 'done');

const categories = {
  'idea': '💡 IDEAS',
  'impl': '🔧 IMPLEMENTATIONS',
  'play': '🎮 PLAY FEEDBACK',
  'note': '📄 NOTES'
};

Object.entries(categories).forEach(([prefix, title]) => {
  content += createCategorySection(title, prefix);
});

fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
fs.writeFileSync(INDEX_FILE, content);
console.log(`Generated ${INDEX_FILE}`);
console.log(`Total files indexed: ${files.length}`);

