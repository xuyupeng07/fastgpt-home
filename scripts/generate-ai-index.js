#!/usr/bin/env node
/**
 * 生成客户案例中心的 AI 搜索索引（content/customers/ai-index.json）。
 *
 * 索引内容：全部已发布内容（case + solution）的 slug/title/分类/简介，
 * 供前端 AI 智能搜索构建系统提示词与本地关键词匹配兜底。
 *
 * 用法：node scripts/generate-ai-index.js
 * 建议：每次更新 content/customers/solutions/** 后运行，或由 verify:customers-data 联动。
 */
const fs = require('fs');
const path = require('path');

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'customers');
const SOLUTIONS_ROOT = path.join(CONTENT_ROOT, 'solutions');
const OUTPUT_FILE = path.join(CONTENT_ROOT, 'ai-index.json');

function walkSolutionFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSolutionFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/[#*>`\[\]|!-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 分类 slug → 名称 映射（JSON 数据只有 categorySlug，名称在 categories.json）
const categoryNameBySlug = new Map();
const categoriesFile = path.join(CONTENT_ROOT, 'categories.json');
if (fs.existsSync(categoriesFile)) {
  for (const c of JSON.parse(fs.readFileSync(categoriesFile, 'utf8'))) {
    categoryNameBySlug.set(c.slug, c.name);
  }
}

const entries = walkSolutionFiles(SOLUTIONS_ROOT)
  .map((file) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .sort((a, b) => String(a.slug || '').localeCompare(String(b.slug || '')))
  .map((d) => ({
    slug: d.slug,
    title: d.title,
    category: d.categorySlug || '',
    categoryName: categoryNameBySlug.get(d.categorySlug) || d.categoryName || '',
    description: stripMarkdown(d.description || '').slice(0, 80)
  }));

const index = {
  version: 1,
  generatedAt: new Date().toISOString(),
  count: entries.length,
  entries
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2) + '\n');
console.log(`[generate-ai-index] ${entries.length} 条 → ${OUTPUT_FILE}`);
