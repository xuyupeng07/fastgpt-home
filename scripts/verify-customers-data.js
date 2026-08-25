#!/usr/bin/env node
// 客户案例中心 JSON 数据源校验（构建前守门）。
// 校验：schema 合法性、slug 唯一、分类存在、脱敏红线、语义 URL 一致性。
// 用法：node scripts/verify-customers-data.js
const fs = require('fs');
const path = require('path');

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'customers');
const SOLUTIONS_ROOT = path.join(CONTENT_ROOT, 'solutions');

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const errors = [];

function readJson(file) {
  const full = path.join(CONTENT_ROOT, file);
  if (!fs.existsSync(full)) {
    errors.push(`缺少数据文件：${file}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    errors.push(`JSON 解析失败：${file} → ${e.message}`);
    return null;
  }
}

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

const categories = readJson('categories.json') || [];
const site = readJson('site.json') || {};

if (!Array.isArray(categories)) {
  errors.push('categories.json 应为数组');
}

const categorySlugs = new Set();
for (const c of categories) {
  if (!c.slug || !SLUG_PATTERN.test(c.slug)) {
    errors.push(`分类 slug 非法：${JSON.stringify(c)}`);
  }
  if (categorySlugs.has(c.slug)) {
    errors.push(`分类 slug 重复：${c.slug}`);
  }
  categorySlugs.add(c.slug);
  if (!c.name) errors.push(`分类缺少 name：${JSON.stringify(c)}`);
}

const solutions = walkSolutionFiles(SOLUTIONS_ROOT).map((file) => {
  try {
    return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    errors.push(`方案 JSON 解析失败：${file} → ${e.message}`);
    return { file, data: null };
  }
}).filter((s) => s.data);

const seenKeys = new Set();
for (const { file, data } of solutions) {
  if (!data.slug || !SLUG_PATTERN.test(data.slug)) {
    errors.push(`方案 slug 非法：${file}`);
  }
  if (!data.categorySlug) {
    errors.push(`方案缺少 categorySlug：${file}`);
  } else if (!categorySlugs.has(data.categorySlug)) {
    errors.push(`方案分类不存在：${file} → ${data.categorySlug}`);
  }
  if (!data.title || !data.description || typeof data.content !== 'string') {
    errors.push(`方案缺少 title/description/content：${file}`);
  }

  const key = `${data.categorySlug}/${data.slug}`;
  if (seenKeys.has(key)) {
    errors.push(`方案语义路径重复：${key}（${file}）`);
  }
  seenKeys.add(key);

  // 脱敏红线（简版）：B 级正文禁数字已在导出侧处理，这里拦截内部备注泄漏。
  if (data.caseOrg && /真实主体见清单|原始数字不进页面/.test(data.caseOrg)) {
    errors.push(`方案存在内部备注泄漏（caseOrg）：${file}`);
  }
  if (data.citedNumbers && /真实主体见清单|原始数字不进页面/.test(data.citedNumbers)) {
    errors.push(`方案存在内部备注泄漏（citedNumbers）：${file}`);
  }

  // 语义 URL 一致性：路径必须等于 /{categorySlug}/{slug}
  const expectedPath = `/${data.categorySlug}/${data.slug}`;
  if (file.replace(/\\/g, '/') !== path.join(SOLUTIONS_ROOT, data.categorySlug, `${data.slug}.json`).replace(/\\/g, '/')) {
    errors.push(`方案文件路径与语义 URL 不一致：${file} → 期望 ${expectedPath}.json`);
  }
}

if (site.overviewStats && !Array.isArray(site.overviewStats)) {
  errors.push('site.json 的 overviewStats 应为数组');
}

if (errors.length > 0) {
  console.error('[verify-customers-data] 校验失败：');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

console.log(
  `[verify-customers-data] passed: ${categories.length} 分类, ${solutions.length} 方案/案例`
);
