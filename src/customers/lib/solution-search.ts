import type { SolutionCardData } from '@customers/types/solution';

export interface CategoryOption {
  id: string;
  name: string;
  slug?: string;
  color?: string;
}

export function normalizeCategoryOptions(
  rawCategories: Array<{ id?: string; _id?: string; name: string; slug?: string; color?: string }> | undefined,
  fallbackCategories: CategoryOption[]
): CategoryOption[] {
  let normalizedList: CategoryOption[] = [];

  if (rawCategories && rawCategories.length > 0) {
    normalizedList = rawCategories.map((category) => ({
      id: category.id || category._id || '',
      name: category.name,
      slug: category.slug,
      color: category.color
    }));
  } else {
    normalizedList = fallbackCategories;
  }

  return [{ id: 'all', name: '全部' }, ...normalizedList];
}

export function filterPublicSolutions(solutions: SolutionCardData[], currentCategory: string) {
  return solutions
    .filter((solution) => {
      const matchesCategory =
        currentCategory === 'all' ||
        solution.categorySlug === currentCategory ||
        solution.categoryName === currentCategory;
      return matchesCategory;
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}
