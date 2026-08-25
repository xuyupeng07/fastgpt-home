import { withBasePath } from '@customers/lib/base-path';

export interface BuildHomeHrefOptions {
  categorySlug?: string | null;
  search?: string | null;
  section?: 'customers' | null;
}

export function buildHomeHref({
  categorySlug,
  search,
  section = null
}: BuildHomeHrefOptions = {}) {
  const params = new URLSearchParams();
  const normalizedCategorySlug = categorySlug?.trim();
  const normalizedSearch = search?.trim();

  if (normalizedCategorySlug && normalizedCategorySlug !== 'all') {
    params.set('category', normalizedCategorySlug);
  }

  if (normalizedSearch) {
    params.set('search', normalizedSearch);
  }

  const query = params.toString();
  const hash = section === 'customers' ? '#customers' : '';

  if (!query && !hash) {
    return withBasePath('/');
  }

  return withBasePath(`/${query ? `?${query}` : ''}${hash}`);
}
