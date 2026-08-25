'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import DesktopToc from '@customers/components/solution/DesktopToc';
import MobileToc from '@customers/components/solution/MobileToc';
import TocToggleButton from '@customers/components/solution/TocToggleButton';
import { useSyncedToc } from '@customers/components/solution/useSyncedToc';
import { openCtaModal, type CtaModalContext } from '@customers/lib/cta';
import type { TocItem } from '@customers/lib/toc';

interface SolutionArticleLayoutProps {
  children: ReactNode;
  tocItems: TocItem[];
  modalContext: CtaModalContext;
}

export default function SolutionArticleLayout({
  children,
  tocItems: fallbackTocItems,
  modalContext
}: SolutionArticleLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const articleRef = useRef<HTMLElement | null>(null);
  const { tocItems, activeId, handleTocItemClick } = useSyncedToc({
    containerRef: articleRef,
    fallbackTocItems
  });
  const openModal = useCallback(
    (context?: CtaModalContext) => openCtaModal(context ?? modalContext),
    [modalContext]
  );

  return (
    <>
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
        solutionId={modalContext.solutionId}
        solutionTitle={modalContext.solutionTitle}
        categoryName={modalContext.categoryName}
        solutionSlug={modalContext.solutionSlug}
        onItemClick={handleTocItemClick}
      />
      <TocToggleButton
        onClick={() => setIsSidebarCollapsed(false)}
        isVisible={isSidebarCollapsed}
        className="hidden lg:flex"
      />
      <div className="relative flex w-full flex-col items-start lg:flex-row">
        <article id="solution-article" ref={articleRef} className="min-w-0 w-full flex-1">
          {children}
        </article>
        <DesktopToc
          isCollapsed={isSidebarCollapsed}
          onCollapse={() => setIsSidebarCollapsed(true)}
          tocItems={tocItems}
          activeId={activeId}
          openModal={openModal}
          solutionId={modalContext.solutionId}
          solutionTitle={modalContext.solutionTitle}
          categoryName={modalContext.categoryName}
          solutionSlug={modalContext.solutionSlug}
          onItemClick={handleTocItemClick}
        />
      </div>
    </>
  );
}
