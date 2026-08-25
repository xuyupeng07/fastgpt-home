import type { SolutionCardData } from '@customers/types/solution';

export interface CategoryOption {
  id: string;
  name: string;
  slug?: string;
  color?: string;
}

/**
 * 关键词匹配：命中标题 / 描述 / 分类名 / 分类 slug 任一即视为匹配。
 * 大小写不敏感；空查询恒为匹配。
 */
export function matchesSolutionSearch(
  title: string,
  description: string,
  rawQuery: string,
  categoryName = '',
  categorySlug = ''
) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const haystack = `${title} ${description} ${categoryName} ${categorySlug}`.toLowerCase();
  return query.split(/\s+/).every((token) => haystack.includes(token));
}

export function filterPublicSolutions(
  solutions: SolutionCardData[],
  currentCategory: string,
  searchQuery = ''
) {
  return solutions
    .filter((solution) => {
      const matchesCategory =
        currentCategory === 'all' ||
        solution.categorySlug === currentCategory ||
        solution.categoryName === currentCategory;

      const matchesSearch = matchesSolutionSearch(
        solution.title,
        solution.description,
        searchQuery,
        solution.categoryName,
        solution.categorySlug
      );

      return matchesCategory && matchesSearch;
    })
    .sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
}
