import axios from 'axios';
import { parseStringPromise } from 'xml2js';

/** All common sitemap paths, including WordPress and custom locations */
const SITEMAP_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/sitemap/sitemap.xml',
  '/sitemaps/sitemap.xml',
  '/news-sitemap.xml',
  '/post-sitemap.xml',
  '/page-sitemap.xml',
];

/** Max child sitemaps to follow when resolving a sitemap index */
const MAX_INDEX_FOLLOW = 5;

async function fetchAndParse(url) {
  const response = await axios.get(url, { timeout: 10000 });
  return parseStringPromise(String(response.data), { explicitArray: true });
}

export async function analyzeSitemap(origin, declaredUrls = []) {
  // Prepend sitemap paths declared in robots.txt — they take priority over guessed locations
  const extraPaths = (declaredUrls || []).flatMap((u) => {
    try {
      const parsed = new URL(u);
      return parsed.origin === origin ? [parsed.pathname] : [];
    } catch {
      return u.startsWith('/') ? [u] : [];
    }
  });
  const pathsToTry = [...new Set([...extraPaths, ...SITEMAP_PATHS])];

  for (const path of pathsToTry) {
    try {
      const url = `${origin}${path}`;
      const parsed = await fetchAndParse(url);
      const isSitemapIndex = !!parsed.sitemapindex;

      if (isSitemapIndex) {
        const childSitemaps = parsed.sitemapindex?.sitemap || [];
        const childSitemapCount = childSitemaps.length;

        // Follow up to MAX_INDEX_FOLLOW children to count real URLs
        let urlCount = 0;
        let hasLastmod = childSitemaps.some((s) => s.lastmod);
        let hasChangefreq = false;
        let hasPriority = false;

        const sitemapBaseUrl = `${origin}${path}`;
        const toFollow = childSitemaps.slice(0, MAX_INDEX_FOLLOW);
        const childResults = await Promise.allSettled(
          toFollow.map(async (child) => {
            const rawLoc = Array.isArray(child.loc) ? child.loc[0] : child.loc;
            const childUrl = new URL(rawLoc, sitemapBaseUrl).href;
            return fetchAndParse(childUrl);
          }),
        );

        for (const res of childResults) {
          if (res.status !== 'fulfilled') continue;
          const childUrls = res.value.urlset?.url || [];
          urlCount += childUrls.length;
          if (childUrls.some((u) => u.lastmod)) hasLastmod = true;
          if (childUrls.some((u) => u.changefreq)) hasChangefreq = true;
          if (childUrls.some((u) => u.priority)) hasPriority = true;
        }

        // Extrapolate total if index has more children than we followed
        const successCount = childResults.filter((r) => r.status === 'fulfilled').length;
        if (childSitemapCount > MAX_INDEX_FOLLOW && successCount > 0) {
          urlCount = Math.round((urlCount / successCount) * childSitemapCount);
        }

        return {
          found: true,
          path,
          urlCount,
          isSitemapIndex: true,
          childSitemapCount,
          hasLastmod,
          hasChangefreq,
          hasPriority,
        };
      } else {
        const urls = parsed.urlset?.url || [];
        return {
          found: true,
          path,
          urlCount: urls.length,
          isSitemapIndex: false,
          childSitemapCount: 0,
          hasLastmod: urls.some((u) => u.lastmod),
          hasChangefreq: urls.some((u) => u.changefreq),
          hasPriority: urls.some((u) => u.priority),
        };
      }
    } catch {
      // try next path
    }
  }

  return {
    found: false,
    path: null,
    urlCount: 0,
    isSitemapIndex: false,
    childSitemapCount: 0,
    hasLastmod: false,
    hasChangefreq: false,
    hasPriority: false,
  };
}
