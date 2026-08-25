'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Solution } from '@customers/components/SolutionCard';
import { PUBLIC_SOLUTIONS_PAGE_SIZE } from '@customers/lib/solution-pagination';
import {
  filterPublicSolutions,
  normalizeCategoryOptions,
  type CategoryOption
} from '@customers/lib/solution-search';
import { withBasePath } from '@customers/lib/base-path';
import { scrollToElementWithNavbarOffset } from '@customers/lib/home-solutions-browser';

interface UseHomeSolutionsInput {
  initialCategories: CategoryOption[];
  initialSolutions: Solution[];
  initialPagination: { total: number; page: number; limit: number; totalPages: number };
  initialCategorySlug?: string;
}

export function useHomeSolutions({
  initialCategories,
  initialSolutions,
  initialCategorySlug
}: UseHomeSolutionsInput) {
  const [currentCategory, setCurrentCategory] = useState(initialCategorySlug || 'all');
  const [page, setPage] = useState(1);
  const solutionsSectionRef = useRef<HTMLElement>(null);

  const categories = useMemo(
    () => normalizeCategoryOptions(initialCategories, initialCategories),
    [initialCategories]
  );

  const filteredSolutions = useMemo(
    () => filterPublicSolutions(initialSolutions, currentCategory),
    [initialSolutions, currentCategory]
  );

  const totalPages = Math.max(1, Math.ceil(filteredSolutions.length / PUBLIC_SOLUTIONS_PAGE_SIZE));
  const solutions = filteredSolutions.slice(0, page * PUBLIC_SOLUTIONS_PAGE_SIZE);
  const hasMoreSolutions = page < totalPages;

  const scrollToSolutionsSection = useCallback(() => {
    scrollToElementWithNavbarOffset(solutionsSectionRef.current);
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
      setCurrentCategory(categorySlug);
      setPage(1);
      if (categorySlug !== 'all') {
        window.history.pushState(window.history.state, '', withBasePath(`/categories/${categorySlug}#customers`));
      } else {
        window.history.pushState(window.history.state, '', withBasePath('/#customers'));
      }
      scrollToSolutionsSection();
    },
    [categories, scrollToSolutionsSection]
  );

  const handleLoadMore = useCallback(() => {
    setPage((p) => (p < totalPages ? p + 1 : p));
  }, [totalPages]);

  return {
    currentCategory,
    categories,
    solutions,
    isLoading: false,
    isShowingStaleSolutions: false,
    hasMoreSolutions,
    isLoadingMore: false,
    isSolutionsLoading: false,
    solutionsSectionRef,
    handleCategoryClick,
    handleCategoryPrefetch: () => {},
    handleLoadMore,
    pinSolutionsHash: () => {}
  };
}
