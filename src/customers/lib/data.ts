// JSON-backed data layer for the static customers case center.
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import type { AiDirectoryEntry } from '@customers/lib/ai-readable-directory';
import { getAutoCategoryColor, normalizeHexColor } from '@customers/lib/category-color';

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'customers');
const SOLUTIONS_ROOT = path.join(CONTENT_ROOT, 'solutions');

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
  order?: number;
}

export interface SolutionRecord {
  id?: string;
  slug: string;
  categorySlug: string;
  title: string;
  description: string;
  contentType?: 'solution' | 'case';
  caseNo?: number;
  caseOrg?: string;
  clearanceLevel?: 'A' | 'B' | 'C' | '';
  citedNumbers?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  freeUseUrl?: string;
  metaTitle?: string;
  metaDescription?: string;
  relatedSolutionSlugs?: string[];
  usage?: string;
  content: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SiteSettings {
  overviewStats?: { value: string; label: string; desc?: string; link?: string; live?: boolean }[];
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function loadCategories(): CategoryRecord[] {
  return readJsonFile<CategoryRecord[]>(path.join(CONTENT_ROOT, 'categories.json'), []);
}

function loadSiteSettings(): SiteSettings {
  return readJsonFile<SiteSettings>(path.join(CONTENT_ROOT, 'site.json'), {});
}

function walkSolutionFiles(): string[] {
  if (!existsSync(SOLUTIONS_ROOT)) return [];
  const result: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.json')) result.push(full);
    }
  };
  walk(SOLUTIONS_ROOT);
  return result;
}

function loadSolutions(): SolutionRecord[] {
  return walkSolutionFiles().map((file) =>
    readJsonFile<SolutionRecord>(file, null as unknown as SolutionRecord)
  );
}

function resolveCategory(solution: SolutionRecord, categories: CategoryRecord[]) {
  const category = categories.find((c) => c.slug === solution.categorySlug);
  const name = category?.name || solution.categorySlug || '未知分类';
  return {
    id: category?.id || solution.categorySlug,
    name,
    slug: category?.slug || solution.categorySlug,
    color: normalizeHexColor(category?.color, getAutoCategoryColor(name))
  };
}

function mapSolutionCard(s: SolutionRecord, categories: CategoryRecord[]) {
  const category = resolveCategory(s, categories);
  const now = new Date().toISOString();
  return {
    id: s.id || s.slug,
    slug: s.slug || '',
    contentType: s.contentType || 'solution',
    hasContent: Boolean(s.content && s.content.trim()),
    caseNo: s.caseNo || 0,
    caseOrg: s.caseOrg || '',
    clearanceLevel: (s.clearanceLevel || '') as 'A' | 'B' | 'C' | '',
    citedNumbers: s.citedNumbers || '',
    categoryId: category.id,
    categoryName: category.name,
    categorySlug: category.slug,
    categoryColor: category.color,
    title: s.title,
    description: s.description,
    imageUrl: s.imageUrl,
    thumbnailUrl: s.thumbnailUrl || s.imageUrl,
    freeUseUrl: s.freeUseUrl || '',
    likes: 0,
    usage: s.usage || '',
    rawUsageCount: 0,
    isLiked: false,
    hasViewed: false,
    createdAt: s.createdAt || now,
    updatedAt: s.updatedAt || s.createdAt || now
  };
}

function mapSolutionDetail(s: SolutionRecord, categories: CategoryRecord[]) {
  const card = mapSolutionCard(s, categories);
  return {
    ...card,
    metaTitle: s.metaTitle || '',
    metaDescription: s.metaDescription || '',
    publishedAt: s.publishedAt || null,
    relatedSolutionIds: s.relatedSolutionSlugs || [],
    content: s.content
  };
}

export function getCategories() {
  return loadCategories().map((c) => ({
    id: c.id || c.slug,
    name: c.name,
    slug: c.slug,
    color: normalizeHexColor(c.color, getAutoCategoryColor(c.name))
  }));
}

export function getSiteSettings(): SiteSettings {
  return loadSiteSettings();
}

export function getAllPublishedSolutions() {
  const categories = loadCategories();
  return loadSolutions().map((s) => mapSolutionCard(s, categories));
}

export function getAllPublishedSolutionDetails() {
  const categories = loadCategories();
  return loadSolutions().map((s) => mapSolutionDetail(s, categories));
}

export function getSolutionByIdPublic(id: string) {
  const categories = loadCategories();
  const solution = loadSolutions().find((s) => s.slug === id || s.id === id);
  return solution ? mapSolutionDetail(solution, categories) : null;
}

export function getRelatedSolutions(solution: {
  id?: string;
  slug?: string;
  categorySlug?: string;
  relatedSolutionIds?: string[];
}) {
  const all = getAllPublishedSolutions();
  const related = (solution.relatedSolutionIds || [])
    .filter((slug) => slug !== solution.id && slug !== solution.slug)
    .map((slug) => all.find((s) => s.slug === slug || s.id === slug))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  if (related.length > 0) return related;

  if (solution.categorySlug) {
    return all
      .filter(
        (s) =>
          s.categorySlug === solution.categorySlug && s.id !== solution.id && s.slug !== solution.id
      )
      .slice(0, 6);
  }

  return [];
}

export function getAllPublishedSolutionDirectoryEntries(): AiDirectoryEntry[] {
  const categories = loadCategories();
  return loadSolutions().map((s) => {
    const category = resolveCategory(s, categories);
    return {
      id: s.id || s.slug,
      slug: s.slug,
      categorySlug: category.slug,
      categoryName: category.name,
      title: s.title,
      description: s.description,
      contentType: s.contentType || 'solution',
      caseNo: s.caseNo || 0,
      caseOrg: s.caseOrg || '',
      clearanceLevel: (s.clearanceLevel || '') as 'A' | 'B' | 'C' | '',
      citedNumbers: s.citedNumbers || ''
    };
  });
}
