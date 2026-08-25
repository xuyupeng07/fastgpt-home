'use client';

import CategoryTabBar from '@customers/components/CategoryTabBar';
import SearchBar from '@customers/components/home/SearchBar';

interface Category {
  id: string;
  name: string;
  slug?: string;
  color?: string;
}

interface FilterBarProps {
  categories: Category[];
  currentCategory: string;
  onCategoryChange: (categoryId: string) => void;
  onCategoryPrefetch?: (categoryId: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onSmartSearch?: (query: string) => void;
  isAiSearching?: boolean;
}

/**
 * 行业分类筛选栏 + AI 智能搜索：
 * 分类 Tabs 在左（可横向滚动），AI 搜索框固定在右侧，二者同行。
 */
export default function FilterBar({
  categories,
  currentCategory,
  onCategoryChange,
  onCategoryPrefetch,
  searchQuery = '',
  onSearchChange,
  onSmartSearch,
  isAiSearching = false
}: FilterBarProps) {
  return (
    <div className="relative mb-7 flex items-end gap-3 pt-1 sm:px-0">
      {/* 分类 Tabs 区域：底部横线只覆盖此区域，不延伸到右侧搜索框 */}
      <div className="relative min-w-0 flex-1 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-surface-300/60 after:content-['']">
        <CategoryTabBar
          categories={categories}
          currentCategory={currentCategory}
          onCategoryChange={onCategoryChange}
          onCategoryPrefetch={onCategoryPrefetch}
          className="w-full"
          maskSurface="paper"
        />
      </div>
      {/* AI 搜索框：固定在筛选栏右侧（分类 Tabs 之后），不随分类滚动 */}
      <div className="w-56 shrink-0 sm:w-72 lg:w-80">
        <SearchBar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          onSmartSearch={onSmartSearch}
          isSearching={isAiSearching}
          compact
        />
      </div>
    </div>
  );
}
