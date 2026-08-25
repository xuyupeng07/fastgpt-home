'use client';

import { type Solution } from '@customers/components/SolutionCard';
import Hero from '@customers/components/Hero';
import TrustedBy from '@/components/home/TrustedBy';
import BottomCta from '@customers/components/BottomCta';
import SolutionsSection from '@customers/components/home/SolutionsSection';
import FadeIn from '@/components/home/motion/FadeIn';
import { useHomeSolutions } from '@customers/hooks/useHomeSolutions';

interface HomeClientProps {
  initialCategories: { id: string; name: string; slug?: string; color?: string }[];
  initialSolutions: Solution[];
  overviewStats: { value: string; label: string; desc?: string; link?: string; live?: boolean }[];
  initialCategorySlug?: string;
}

export default function HomeClient({
  initialCategories,
  initialSolutions,
  overviewStats,
  initialCategorySlug
}: HomeClientProps) {
  const homeSolutions = useHomeSolutions({
    initialCategories,
    initialSolutions,
    initialCategorySlug
  });

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
            hasMoreSolutions={homeSolutions.hasMoreSolutions}
            onCategoryChange={homeSolutions.handleCategoryClick}
            onLoadMore={homeSolutions.handleLoadMore}
            searchQuery={homeSolutions.searchQuery}
            onSearchChange={homeSolutions.handleSearchChange}
          />

          <TrustedBy t={{ caption: '深受行业领军团队信赖' }} />
        </div>

        <div className="w-full bg-light-bg pb-0 relative">
          <FadeIn>
            <BottomCta
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
