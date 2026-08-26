'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Solution } from '@customers/components/SolutionCard';
import { PUBLIC_SOLUTIONS_PAGE_SIZE } from '@customers/lib/solution-pagination';
import { filterPublicSolutions, type CategoryOption } from '@customers/lib/solution-search';
import { withBasePath } from '@customers/lib/base-path';

interface UseHomeSolutionsInput {
  initialCategories: CategoryOption[];
  initialSolutions: Solution[];
  initialCategorySlug?: string;
}

export function useHomeSolutions({
  initialCategories,
  initialSolutions,
  initialCategorySlug
}: UseHomeSolutionsInput) {
  const router = useRouter();
  const currentCategory = initialCategorySlug || 'all';
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const solutionsSectionRef = useRef<HTMLElement>(null);
  const categories = useMemo(
    () => [{ id: 'all', name: '全部' }, ...initialCategories],
    [initialCategories]
  );

  const filteredSolutions = useMemo(
    () => filterPublicSolutions(initialSolutions, currentCategory, searchQuery),
    [initialSolutions, currentCategory, searchQuery]
  );

  const totalPages = Math.max(1, Math.ceil(filteredSolutions.length / PUBLIC_SOLUTIONS_PAGE_SIZE));
  const solutions = filteredSolutions.slice(0, page * PUBLIC_SOLUTIONS_PAGE_SIZE);
  const hasMoreSolutions = page < totalPages;

  const scrollToSolutionsSection = useCallback(() => {
    solutionsSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setPage(1);
  }, []);

  // 带 #customers 锚点进入（如从详情页分类徽章 / 首页「案例中心」跳转）时，
  // 滚动到案例列表区，并补偿导航栏高度，保证定位准确。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#customers') {
      const timer = window.setTimeout(scrollToSolutionsSection, 80);
      return () => window.clearTimeout(timer);
    }
  }, [scrollToSolutionsSection]);

  const handleCategoryClick = useCallback(
    (categoryId: string) => {
      const selectedCategory = categories.find((c) => c.id === categoryId);
      const categorySlug = selectedCategory?.slug || categoryId;
      const href =
        categorySlug === 'all'
          ? withBasePath('/#customers')
          : withBasePath(`/categories/${categorySlug}#customers`);
      setPage(1);
      router.push(href, { scroll: false });
      scrollToSolutionsSection();
    },
    [categories, router, scrollToSolutionsSection]
  );

  const handleLoadMore = useCallback(() => {
    setPage((p) => (p < totalPages ? p + 1 : p));
  }, [totalPages]);

  return {
    currentCategory,
    categories,
    solutions,
    searchQuery,
    hasMoreSolutions,
    solutionsSectionRef,
    handleCategoryClick,
    handleSearchChange,
    handleLoadMore
  };
}
