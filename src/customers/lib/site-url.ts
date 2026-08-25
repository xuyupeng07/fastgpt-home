const DEFAULT_SITE_URL = 'https://fastgpt.cn/customers';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function normalizeSiteUrl(rawUrl?: string | null) {
  const trimmedUrl = rawUrl?.trim();
  if (!trimmedUrl) return null;
  const urlWithProtocol = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
  try {
    return trimTrailingSlash(new URL(urlWithProtocol).toString());
  } catch {
    return null;
  }
}

export function getSiteUrl() {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_CUSTOMERS_SITE_URL) || DEFAULT_SITE_URL;
}

export function absoluteUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return normalizedPath === '/' ? getSiteUrl() : `${getSiteUrl()}${normalizedPath}`;
}
