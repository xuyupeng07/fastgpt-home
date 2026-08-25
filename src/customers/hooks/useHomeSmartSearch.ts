'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSolutionPublicHref } from '@customers/lib/solution-url';
import { withBasePath } from '@customers/lib/base-path';
import { smartSearch, AI_INDEX, type AiFailureKind } from '@customers/lib/ai-search';
import { trackRybbitEvent } from '@customers/lib/rybbit';
import { toast } from 'sonner';
import type { Solution } from '@customers/components/SolutionCard';

interface UseHomeSmartSearchInput {
  solutions: Solution[];
}

const NO_MATCH_DESCRIPTION = '您可以尝试输入如「智能客服」「报销审批」「营销获客」等词汇';

/** AI 失败原因的友好文案（仅在降级且未命中时提示） */
const FAILURE_HINT: Record<AiFailureKind | 'not-configured', string> = {
  timeout: 'AI 匹配服务响应超时，本次使用了关键词匹配',
  network: 'AI 匹配服务暂时不可用，本次使用了关键词匹配',
  http: 'AI 匹配服务异常，本次使用了关键词匹配',
  'bad-response': 'AI 匹配服务返回异常，本次使用了关键词匹配',
  'not-configured': 'AI 匹配服务未配置，本次使用了关键词匹配'
};

/**
 * AI 智能搜索 hook：调起 smartSearch（AI 优先、本地兜底），命中后跳转对应详情页。
 */
export function useHomeSmartSearch({ solutions }: UseHomeSmartSearchInput) {
  const router = useRouter();
  const [isAiSearching, setIsAiSearching] = useState(false);

  const handleSmartSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      setIsAiSearching(true);
      try {
        const outcome = await smartSearch(trimmed);

        trackRybbitEvent('search', {
          keyword: trimmed,
          result_count: outcome.matchedSlug ? 1 : 0,
          search_type: outcome.via,
          ...(outcome.failure ? { failure: outcome.failure } : {})
        });

        if (outcome.matchedSlug) {
          // 优先用索引（与 AI 返回的 slug 一致）；索引缺失时回退本地 solutions 列表
          const indexEntry = AI_INDEX.entries.find((e) => e.slug === outcome.matchedSlug);
          const matchedSolution = solutions.find(
            (s) => s.slug === outcome.matchedSlug || s.id === outcome.matchedSlug
          );

          if (indexEntry || matchedSolution) {
            const href = withBasePath(
              getSolutionPublicHref({
                id: matchedSolution?.id ?? outcome.matchedSlug,
                categorySlug: indexEntry?.category || matchedSolution?.categorySlug,
                slug: outcome.matchedSlug
              })
            );

            // AI 直接命中 vs 降级本地命中：提示文案略有差异，帮助用户理解结果来源
            if (outcome.via === 'ai') {
              toast.success(`为您找到匹配案例：${indexEntry?.title || matchedSolution?.title || ''}`);
            } else {
              toast.success(
                `为您找到相关案例：${indexEntry?.title || matchedSolution?.title || ''}（关键词匹配）`
              );
            }
            router.push(href);
            return;
          }
        }

        // 未命中：若 AI 失败降级而来，附带失败原因提示；否则为正常的"无匹配"
        toast.info('抱歉，未能匹配到相关案例，请换个说法试试~', {
          description: outcome.failure ? `${FAILURE_HINT[outcome.failure]}。\n${NO_MATCH_DESCRIPTION}` : NO_MATCH_DESCRIPTION
        });
      } catch (error) {
        console.error('智能搜索请求失败', error);
        toast.error('请求失败，请检查网络或稍后重试');
      } finally {
        setIsAiSearching(false);
      }
    },
    [router, solutions]
  );

  return {
    isAiSearching,
    handleSmartSearch
  };
}
