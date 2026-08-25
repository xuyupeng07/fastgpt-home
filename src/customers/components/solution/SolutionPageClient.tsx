'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { ArrowRightIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import SolutionCard, { Solution as CardSolution } from '@customers/components/SolutionCard';
import { markdownComponents } from '@customers/components/solution/MarkdownComponents';
import TocToggleButton from '@customers/components/solution/TocToggleButton';
import SolutionHero from '@customers/components/solution/SolutionHero';
import BottomCta from '@customers/components/BottomCta';
import MobileToc from '@customers/components/solution/MobileToc';
import DesktopToc from '@customers/components/solution/DesktopToc';
import { withBasePath } from '@customers/lib/base-path';
import { useSyncedToc } from '@customers/components/solution/useSyncedToc';
import { buildHomeHref } from '@customers/lib/home-routing';
import { getSolutionPublicHref } from '@customers/lib/solution-url';
import { openCtaModal, type CtaModalContext } from '@customers/lib/cta';
import ReactMarkdown from 'react-markdown';
import {
  MARKDOWN_PROSE_CLASSES,
  markdownRehypePlugins,
  markdownRemarkPlugins,
  prepareMarkdownContent
} from '@customers/components/solution/markdownConfig';

interface SolutionDetail extends CardSolution {
  content: string;
  updatedAt?: string;
}

interface SolutionPageClientProps {
  id: string;
  initialSolution: SolutionDetail | null;
  initialAllSolutions?: CardSolution[];
}

const MarkdownArticle = memo(function MarkdownArticle({ content }: { content: string }) {
  return (
    <div
      className={`${MARKDOWN_PROSE_CLASSES} transition-all duration-500 ease-in-out text-[15px] sm:text-base`}
    >
      <ReactMarkdown
        remarkPlugins={markdownRemarkPlugins}
        rehypePlugins={markdownRehypePlugins}
        components={markdownComponents}
      >
        {prepareMarkdownContent(content)}
      </ReactMarkdown>
    </div>
  );
});

export default function SolutionPageClient({
  id,
  initialSolution,
  initialAllSolutions = []
}: SolutionPageClientProps) {
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const articleRef = useRef<HTMLElement | null>(null);
  const scrollTickingRef = useRef(false);

  const solution = initialSolution;
  const allSolutionsData = { solutions: initialAllSolutions };

  const markdownContent = useMemo(() => solution?.content || '', [solution]);

  const openModal = useCallback(
    (context?: CtaModalContext) => {
      openCtaModal(
        context ?? {
          source: 'customers_bottom',
          title: '申请免费 POC 验证',
          subtitle:
            '填写约 1 分钟。商务顾问将在 1 天内联系你，确认需求后最快 3 天交付 POC 验证，助力后续生产级交付。',
          solutionId: solution?.id,
          solutionTitle: solution?.title,
          categoryName: solution?.categoryName,
          solutionSlug: solution?.slug
        }
      );
    },
    [solution?.categoryName, solution?.id, solution?.title, solution?.slug]
  );

  const scrollToPageTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigationSolutions = useMemo(() => {
    if (!solution) return [];
    const solutions = allSolutionsData.solutions as CardSolution[];
    const hasCurrentSolution = solutions.some((item) => String(item.id) === String(solution.id));
    return hasCurrentSolution ? solutions : [solution, ...solutions];
  }, [allSolutionsData.solutions, solution]);

  const prevSolution = useMemo(() => {
    if (!solution || navigationSolutions.length <= 1) return null;
    const currentIndex = navigationSolutions.findIndex(
      (item) => String(item.id) === String(solution.id)
    );
    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
    const previousIndex =
      (safeCurrentIndex - 1 + navigationSolutions.length) % navigationSolutions.length;
    const previousSolution = navigationSolutions[previousIndex];
    return { id: previousSolution.id, title: previousSolution.title };
  }, [navigationSolutions, solution]);

  const nextSolution = useMemo(() => {
    if (!solution || navigationSolutions.length <= 1) return null;
    const currentIndex = navigationSolutions.findIndex(
      (item) => String(item.id) === String(solution.id)
    );
    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeCurrentIndex + 1) % navigationSolutions.length;
    const nextSolution = navigationSolutions[nextIndex];
    return { id: nextSolution.id, title: nextSolution.title };
  }, [navigationSolutions, solution]);

  const allRelatedSolutions = useMemo(() => {
    if (!solution || allSolutionsData.solutions.length === 0) return [];
    const otherSolutions = allSolutionsData.solutions.filter(
      (solutionItem: CardSolution) => solutionItem.id !== solution.id
    );
    const sameCategory = otherSolutions.filter(
      (solutionItem: CardSolution) => solutionItem.categoryId === solution.categoryId
    );
    const differentCategory = otherSolutions.filter(
      (solutionItem: CardSolution) => solutionItem.categoryId !== solution.categoryId
    );
    return [...sameCategory, ...differentCategory];
  }, [solution, allSolutionsData.solutions]);

  const itemsPerPage = 3;
  const totalPages = Math.ceil(allRelatedSolutions.length / itemsPerPage);

  const currentSolutions = useMemo(() => {
    const start = currentPage * itemsPerPage;
    return allRelatedSolutions.slice(start, start + itemsPerPage);
  }, [allRelatedSolutions, currentPage]);

  const getSolutionHref = useCallback(
    (solutionId: string | number) => {
      const matchedSolution = allSolutionsData.solutions.find(
        (solutionItem: CardSolution) => String(solutionItem.id) === String(solutionId)
      );
      return withBasePath(
        matchedSolution?.categorySlug
          ? getSolutionPublicHref(matchedSolution)
          : getSolutionPublicHref({ id: solutionId, categorySlug: solution?.categorySlug })
      );
    },
    [allSolutionsData.solutions, solution?.categorySlug]
  );

  const nextPage = useCallback(() => {
    if (totalPages <= 1) return;
    setCurrentPage((prev) => (prev + 1) % totalPages);
  }, [totalPages]);

  const prevPage = useCallback(() => {
    if (totalPages <= 1) return;
    setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
  }, [totalPages]);

  const handleCategoryClick = useCallback(
    (categoryId: string) => {
      const matchedRelated = allSolutionsData.solutions.find(
        (item: CardSolution) => String(item.categoryId) === String(categoryId)
      );
      const categorySlug =
        matchedRelated?.categorySlug ||
        (solution && String(solution.categoryId) === String(categoryId)
          ? solution.categorySlug
          : undefined);
      if (categorySlug) {
        router.push(withBasePath(`/categories/${categorySlug}#customers`));
      }
    },
    [router, solution, allSolutionsData.solutions]
  );

  useEffect(() => {
    let rafId: number;
    const handleScroll = () => {
      if (scrollTickingRef.current) return;
      scrollTickingRef.current = true;
      rafId = requestAnimationFrame(() => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height =
          document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
        const progressBar = document.getElementById('reading-progress');
        if (progressBar) {
          progressBar.style.width = scrolled + '%';
        }
        scrollTickingRef.current = false;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const { tocItems, activeId, handleTocItemClick } = useSyncedToc({
    containerRef: articleRef,
    markdownContent
  });

  if (!solution) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-100">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600 mb-4"></div>
          <p className="text-ink-sub">正在加载案例详情...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-100 font-sans text-[#2b2f36] selection:bg-[#e8f3ff] selection:text-[#1f2329] flex flex-col">
      <div
        className="fixed top-0 left-0 h-1 bg-brand-500 z-50 transition-all duration-300"
        style={{ width: '0%' }}
        id="reading-progress"
      ></div>

      <main className="flex-1 pt-16">
        <div className="sticky top-16 z-30 hidden transition-all duration-300 pointer-events-none -mb-10 sm:block">
          <div className="w-full bg-white/0 backdrop-blur-2xl border-b border-transparent pointer-events-auto transform-gpu">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:pl-4 lg:pr-8 pt-3 pb-3">
              <nav className="flex items-center text-sm font-medium text-ink-sub w-fit">
                <Link
                  href={buildHomeHref({ section: 'customers' })}
                  className="hover:text-brand-600 transition-colors"
                >
                  案例中心
                </Link>
                <span className="mx-2">/</span>
                <Link
                  href={withBasePath(`/categories/${solution.categorySlug}#customers`)}
                  className="hover:text-brand-600 transition-colors"
                >
                  {solution.categoryName}
                </Link>
                <span className="mx-2">/</span>
                <button
                  type="button"
                  onClick={scrollToPageTop}
                  className="text-[#1f2329] font-medium truncate max-w-[200px] sm:max-w-xs hover:text-brand-600 transition-colors cursor-pointer text-left"
                  aria-label={`回到${solution.title}页面顶部`}
                >
                  {solution.title}
                </button>
              </nav>
            </div>
          </div>
        </div>

        <SolutionHero
          solution={solution}
          prevSolution={prevSolution}
          nextSolution={nextSolution}
          getNavHref={getSolutionHref}
          openModal={openModal}
          onCategoryClick={handleCategoryClick}
          onBack={() => {
            if (window.history.length > 1) {
              router.back();
            } else {
              router.push(buildHomeHref({ section: 'customers' }));
            }
          }}
        />

        <div className="w-full bg-white pt-6 pb-0 relative">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <TocToggleButton
              onClick={() => setIsMobileMenuOpen(true)}
              isVisible={!isMobileMenuOpen}
              className="lg:hidden"
            />
            <MobileToc
              isOpen={isMobileMenuOpen}
              onClose={() => setIsMobileMenuOpen(false)}
              tocItems={tocItems}
              activeId={activeId}
              openModal={openModal}
              solutionId={solution.id}
              solutionTitle={solution.title}
              categoryName={solution.categoryName}
              solutionSlug={solution.slug}
              onItemClick={handleTocItemClick}
            />
            <TocToggleButton
              onClick={() => setIsSidebarCollapsed(false)}
              isVisible={isSidebarCollapsed}
              className="hidden lg:flex"
            />
            <div className="flex flex-col lg:flex-row items-start relative w-full">
              <article
                ref={articleRef}
                className="min-w-0 flex-1 w-full transition-all duration-500 ease-in-out"
              >
                <MarkdownArticle content={markdownContent} />
              </article>
              <DesktopToc
                isCollapsed={isSidebarCollapsed}
                onCollapse={() => setIsSidebarCollapsed(true)}
                tocItems={tocItems}
                activeId={activeId}
                openModal={openModal}
                solutionId={solution.id}
                solutionTitle={solution.title}
                categoryName={solution.categoryName}
                onItemClick={handleTocItemClick}
              />
            </div>
          </div>
        </div>

        <div className="w-full bg-white py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative flex flex-col items-center mb-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-[#1f2329] font-display tracking-tight">
                  更多行业案例
                </h2>
                <p className="mt-1.5 text-sm text-ink-sub max-w-2xl">
                  探索 FastGPT 在不同领域的更多智能化应用方案
                </p>
              </div>
              <div className="md:absolute md:right-0 md:bottom-1 mt-2.5 md:mt-0">
                <Link
                  href={buildHomeHref({ section: 'customers' })}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors group"
                >
                  查看全部案例
                  <ArrowRightIcon
                    weight="bold"
                    className="text-xs transition-transform duration-300 group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            </div>

            <div className="relative group/carousel px-0 sm:px-12">
              <button
                onClick={prevPage}
                className="absolute -left-2 sm:left-0 top-[42%] -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm border border-surface-200 text-[#8f959e] hover:text-brand-600 hover:scale-105 transition-all cursor-pointer"
                aria-label="Previous page"
              >
                <CaretLeftIcon size={18} weight="bold" />
              </button>
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
                {currentSolutions.map((item, index) => (
                  <div key={`${item.id}-${currentPage}`} className="flex h-full">
                    <SolutionCard
                      solution={item}
                      index={index}
                      onCategoryClick={handleCategoryClick}
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={nextPage}
                className="absolute -right-2 sm:right-0 top-[42%] -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm border border-surface-200 text-[#8f959e] hover:text-brand-600 hover:scale-105 transition-all cursor-pointer"
                aria-label="Next page"
              >
                <CaretRightIcon size={18} weight="bold" />
              </button>
              <div className="flex justify-center gap-1.5 mt-6">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i)}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      currentPage === i ? 'w-5 bg-brand-500' : 'w-1.5 bg-gray-200 hover:bg-gray-300'
                    }`}
                    aria-label={`Go to page ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <BottomCta
          openModal={openModal}
          title="免费验证这个方案是否适合你的业务"
          description="提交业务流程、数据现状和目标效果。商务顾问将在 1 天内联系你，确认需求后由 FastGPT 团队最快 3 天完成免费 POC 验证，帮助判断是否具备生产落地价值。"
          buttonLabel="申请免费 POC"
          showTopBorder={false}
          modalContext={{
            source: 'customers_bottom',
            title: '申请免费 POC 验证',
            subtitle:
              '填写约 1 分钟。商务顾问将在 1 天内联系你，确认需求后最快 3 天交付该方案的免费 POC 验证。',
            solutionId: solution.id,
            solutionTitle: solution.title,
            categoryName: solution.categoryName,
            solutionSlug: solution.slug
          }}
        />
      </main>
    </div>
  );
}
