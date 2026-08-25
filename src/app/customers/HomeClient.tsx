'use client';

import { useState } from 'react';
import { type Solution } from '@customers/components/SolutionCard';
import Hero from '@customers/components/Hero';
import TrustedBy from '@/components/home/TrustedBy';
import BottomCta from '@customers/components/BottomCta';
import SolutionsSection from '@customers/components/home/SolutionsSection';
import FadeIn from '@/components/home/motion/FadeIn';
import { openCtaModal, type CtaModalContext } from '@customers/lib/cta';
import { useHomeSolutions } from '@customers/hooks/useHomeSolutions';
import { useHomeSmartSearch } from '@customers/hooks/useHomeSmartSearch';

interface SolutionsPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface HomeClientProps {
  initialCategories: { id: string; name: string; slug?: string; color?: string }[];
  initialSolutions: Solution[];
  initialPagination: SolutionsPagination;
  overviewStats: { value: string; label: string; desc?: string; link?: string; live?: boolean }[];
  initialCategorySlug?: string;
}

export default function HomeClient({
  initialCategories,
  initialSolutions,
  initialPagination,
  overviewStats,
  initialCategorySlug
}: HomeClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const homeSolutions = useHomeSolutions({
    initialCategories,
    initialSolutions,
    initialPagination,
    initialCategorySlug,
    searchQuery
  });

  const { isAiSearching, handleSmartSearch } = useHomeSmartSearch({
    solutions: initialSolutions
  });

  const openModal = (context?: CtaModalContext) => {
    openCtaModal(
      context ?? {
        source: 'home_bottom',
        title: '申请免费 POC 验证',
        subtitle:
          '填写约 1 分钟。商务顾问将在 1 天内联系你，确认需求后最快 3 天交付 POC 验证，助力后续生产级交付。'
      }
    );
  };

  return (
    <>
      <Hero overviewStats={overviewStats} />

      <main className="pb-0 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 sm:mt-8 relative z-10">
          <SolutionsSection
            sectionRef={homeSolutions.solutionsSectionRef}
            categories={homeSolutions.categories}
            currentCategory={homeSolutions.currentCategory}
            solutions={homeSolutions.solutions}
            isLoading={homeSolutions.isLoading}
            isShowingStaleSolutions={homeSolutions.isShowingStaleSolutions}
            hasMoreSolutions={homeSolutions.hasMoreSolutions}
            isLoadingMore={homeSolutions.isLoadingMore}
            isSolutionsLoading={homeSolutions.isSolutionsLoading}
            onCategoryChange={homeSolutions.handleCategoryClick}
            onCategoryPrefetch={homeSolutions.handleCategoryPrefetch}
            onLoadMore={homeSolutions.handleLoadMore}
            onOpenModal={(ctx) => openModal(ctx)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSmartSearch={handleSmartSearch}
            isAiSearching={isAiSearching}
          />

          <TrustedBy t={{ caption: '深受行业领军团队信赖' }} />
        </div>

        <div className="w-full bg-light-bg pb-0 relative">
          <FadeIn>
            <BottomCta
              openModal={openModal}
              showTopBorder={false}
              modalContext={{
                source: 'home_bottom',
                title: '申请免费 POC 验证',
                subtitle:
                  '填写约 1 分钟。商务顾问将在 1 天内联系你，确认需求后最快 3 天交付 POC 验证，助力后续生产级交付。'
              }}
            />
          </FadeIn>
        </div>
      </main>
    </>
  );
}
