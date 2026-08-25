#!/usr/bin/env node
// 说明：fastgpt.cn/customers 为纯静态导出，已无 /api/* 数据端点，本脚本不再有可用数据源。
// 当前数据维护以「手动编辑 content/customers/**」为主。以下命令仅作历史参考，勿直接运行：
// node scripts/sync-customers-json.mjs [--base https://fastgpt.cn/customers]
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

const BASE = process.env.SOLUTIONS_BASE || process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] || 'https://fastgpt.cn/customers';
const CONTENT_ROOT = path.join(process.cwd(), 'content', 'customers');

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

function toArray(data, key) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[key])) return data[key];
  return [];
}

async function main() {
  console.log(`[sync-customers-json] base=${BASE}`);

  const categoriesRaw = await fetchJson(`${BASE}/api/categories`);
  const categories = toArray(categoriesRaw, 'categories').map((c) => ({
    id: c.id || c.slug,
    name: c.name,
    slug: c.slug,
    color: c.color || null,
    order: c.order ?? 0
  }));
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  const solutionsRaw = await fetchJson(`${BASE}/api/solutions?limit=200`);
  const solutions = toArray(solutionsRaw, 'solutions');

  const entries = [];
  for (const s of solutions) {
    const categorySlug = s.categorySlug || s.categoryId?.slug;
    const category = categoryBySlug.get(categorySlug);
    // 正文优先从语义 markdown 端点拉取，回退到列表里的 content 字段。
    let content = s.content || '';
    const markdownPath = `/solution/${s.slug || s.id}/markdown`;
    try {
      const mdRes = await fetch(`${BASE}${markdownPath}`);
      if (mdRes.ok) {
        const text = await mdRes.text();
        if (text && text.trim()) content = text;
      }
    } catch {
      // markdown 端点不可用时保留列表 content。
    }

    entries.push({
      id: s.id ? String(s.id) : undefined,
      slug: s.slug || s.id,
      categorySlug,
      title: s.title,
      description: s.description || '',
      contentType: s.contentType || 'solution',
      caseNo: s.caseNo || 0,
      caseOrg: s.caseOrg || '',
      clearanceLevel: s.clearanceLevel || '',
      citedNumbers: s.citedNumbers || '',
      imageUrl: s.imageUrl || s.thumbnailUrl || '',
      thumbnailUrl: s.thumbnailUrl || s.imageUrl || '',
      freeUseUrl: s.freeUseUrl || '',
      metaTitle: s.metaTitle || '',
      metaDescription: s.metaDescription || '',
      relatedSolutionSlugs: s.relatedSolutionSlugs || [],
      usage: s.usage || s.formattedUsageCount || '',
      content,
      publishedAt: s.publishedAt || s.createdAt || null,
      createdAt: s.createdAt || new Date().toISOString(),
      updatedAt: s.updatedAt || s.createdAt || new Date().toISOString()
    });
  }

  const categoryByName = (name) => categories.find((c) => c.name === name);
  const searchCases = entries.map((e) => ({
    name: e.title,
    slug: e.slug,
    categorySlug: e.categorySlug
  }));

  mkdirSync(CONTENT_ROOT, { recursive: true });
  writeFileSync(path.join(CONTENT_ROOT, 'categories.json'), JSON.stringify(categories, null, 2) + '\n');
  writeFileSync(path.join(CONTENT_ROOT, 'search-index.json'), JSON.stringify({ cases: searchCases }, null, 2) + '\n');
  if (!existsSync(path.join(CONTENT_ROOT, 'site.json'))) {
    writeFileSync(path.join(CONTENT_ROOT, 'site.json'), JSON.stringify({
      overviewStats: [
        { value: '100+', label: '行业定制模板' },
        { value: '20+', label: '垂直行业覆盖' }
      ]
    }, null, 2) + '\n');
  }

  for (const e of entries) {
    if (!e.categorySlug || !e.slug) continue;
    const dir = path.join(CONTENT_ROOT, 'solutions', e.categorySlug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${e.slug}.json`), JSON.stringify(e, null, 2) + '\n');
  }

  console.log(`[sync-customers-json] 完成：${categories.length} 分类, ${entries.length} 方案/案例`);
  console.log('[sync-customers-json] 下一步：node scripts/verify-customers-data.js 校验后提交');
}

main().catch((err) => {
  console.error('[sync-customers-json] 失败：', err.message);
  process.exit(1);
});
