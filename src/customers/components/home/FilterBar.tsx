import CategoryTabBar from '@customers/components/CategoryTabBar';

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
}

export default function FilterBar({
  categories,
  currentCategory,
  onCategoryChange,
  onCategoryPrefetch
}: FilterBarProps) {
  return (
    <div className="relative mb-7 flex items-center justify-between gap-3 px-1 pt-1 sm:px-0 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-surface-300/60 after:content-[''] ">
      <CategoryTabBar
        categories={categories}
        currentCategory={currentCategory}
        onCategoryChange={onCategoryChange}
        onCategoryPrefetch={onCategoryPrefetch}
        className="flex-1"
        maskSurface="paper"
      />
    </div>
  );
}
