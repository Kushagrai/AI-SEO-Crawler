import { chromium } from 'playwright';
import { analyzeSemantics } from './analyzers/semantics.js';
import { analyzeRobots } from './analyzers/robots.js';
import { analyzeSitemap } from './analyzers/sitemap.js';
import { analyzeLlmsTxt } from './analyzers/llmsTxt.js';
import { scoreAiSeo } from './analyzers/aiSeo.js';

const SKIP_EXTENSIONS = /\.(pdf|jpg|jpeg|png|zip|gif|svg|ico|woff|woff2|css|js|mp4|mp3|webp|ttf|eot)(\?.*)?$/i;

/** Politeness delay between requests (ms) */
const REQUEST_DELAY = 200;

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    const path = u.pathname.replace(/\/$/, '') || '/';
    return `${u.origin}${path}`;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Processes a single page using a pre-allocated browser page.
 * Returns { pageResult, links[] } where links are new URLs discovered.
 */
async function processPage(browserPage, url, depth, startOrigin, maxDepth) {
  const normalized = normalizeUrl(url);
  const pageResult = { url: normalized, depth };
  const startTime = Date.now();

  try {
    const response = await browserPage.goto(url, {
      waitUntil: 'domcontentloaded', // faster than networkidle; avoids hanging on WS/long-poll
      timeout: 15000,
    });

    const contentType = response?.headers()['content-type'] || '';
    if (!contentType.includes('text/html')) {
      pageResult.error = 'non-html';
      pageResult.renderTime = Date.now() - startTime;
      return { pageResult, links: [] };
    }

    // Wait for network to settle — catches SPA hydration; fall back on WebSocket/long-poll pages
    try {
      await browserPage.waitForLoadState('networkidle', { timeout: 3000 });
    } catch {
      await sleep(800);
    }

    const html = await browserPage.content();
    pageResult.renderTime = Date.now() - startTime;
    pageResult.semantics = analyzeSemantics(html, normalized);

    const links = [];
    if (depth < maxDepth) {
      // Use the actual landed URL for origin checking — handles www ↔ non-www redirects
      const actualPageUrl = browserPage.url() || url;
      const actualOrigin = new URL(actualPageUrl).origin;
      const hrefs = await browserPage.$$eval('a[href]', (els) => els.map((el) => el.href));
      for (const href of hrefs) {
        if (!href || href.startsWith('#')) continue;
        try {
          const resolved = new URL(href, actualPageUrl);
          if (resolved.origin !== actualOrigin) continue;
          if (SKIP_EXTENSIONS.test(resolved.pathname)) continue;
          const norm = normalizeUrl(resolved.href);
          if (norm) links.push({ url: resolved.href, depth: depth + 1 });
        } catch {
          // skip invalid URL
        }
      }
    }

    return { pageResult, links };
  } catch (err) {
    pageResult.error = err.message?.includes('Timeout') ? 'timeout' : (err.message || 'unknown error');
    pageResult.renderTime = Date.now() - startTime;
    return { pageResult, links: [] };
  }
}

/**
 * Main crawl function.
 *
 * @param {string}   startUrl    - URL to begin crawling from
 * @param {number}   maxDepth    - BFS depth limit (default 3)
 * @param {number}   maxPages    - Hard cap on pages crawled (default 100)
 * @param {number}   concurrency - Parallel browser pages (default 3)
 * @param {Function} onProgress  - Called with (url, pageCount) on each page start
 */
export async function crawl(startUrl, maxDepth = 3, maxPages = 100, concurrency = 3, onProgress = null, signal = null) {
  const startOrigin = new URL(startUrl).origin;
  const visited = new Set();
  const queue = [{ url: startUrl, depth: 0 }];
  const pages = [];

  // Fetch robots first — its declared Sitemap URLs are passed to the sitemap analyzer
  const robots = await analyzeRobots(startOrigin);
  const [sitemap, llmsTxt] = await Promise.all([
    analyzeSitemap(startOrigin, robots.sitemapDeclared),
    analyzeLlmsTxt(startOrigin),
  ]);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (err) {
    if (err.message?.includes("Executable doesn't exist") || err.message?.includes('browserType.launch')) {
      throw new Error('Playwright browser not found. Run: npx playwright install chromium');
    }
    throw err;
  }

  try {
    // Pre-allocate a fixed pool of browser pages (avoids per-page create/close overhead)
    const pool = await Promise.all(
      Array.from({ length: concurrency }, () => browser.newPage()),
    );

    // Disable resource types we don't need — speeds up page loads significantly
    await Promise.all(
      pool.map((p) =>
        p.route('**/*', (route) => {
          const type = route.request().resourceType();
          if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
            route.abort();
          } else {
            route.continue();
          }
        }),
      ),
    );

    const available = [...pool]; // pages currently idle
    let inFlight = 0;            // tasks currently running

    /**
     * Cooperative scheduler: runs until queue is empty AND all tasks are done.
     * Re-entrant — called by each completing task to kick off the next item.
     */
    async function schedule() {
      while (true) {
        if (signal?.aborted) break;
        // Drain already-visited entries from the front of the queue
        while (queue.length > 0) {
          const { url } = queue[0];
          const norm = normalizeUrl(url);
          if (!norm || visited.has(norm) || SKIP_EXTENSIONS.test(url)) {
            queue.shift();
          } else {
            break;
          }
        }

        // Termination: nothing queued and nothing running
        if (queue.length === 0 && inFlight === 0) break;

        // Wait if: at concurrency limit, or queue is empty but workers are still running
        if (available.length === 0 || queue.length === 0) {
          await sleep(30);
          continue;
        }

        if (pages.length + inFlight >= maxPages) {
          if (inFlight === 0) break;
          await sleep(30);
          continue;
        }

        const { url, depth } = queue.shift();
        const norm = normalizeUrl(url);
        if (!norm || visited.has(norm) || SKIP_EXTENSIONS.test(url)) continue;
        visited.add(norm);

        if (onProgress) onProgress(norm, pages.length);

        const browserPage = available.pop();
        inFlight++;

        // Fire-and-forget; scheduler is notified when it completes
        (async () => {
          await sleep(REQUEST_DELAY);
          try {
            if (signal?.aborted) return;
            const { pageResult, links } = await processPage(browserPage, url, depth, startOrigin, maxDepth);
            pages.push(pageResult);
            for (const link of links) {
              const linkNorm = normalizeUrl(link.url);
              if (linkNorm && !visited.has(linkNorm)) {
                queue.push(link);
              }
            }
          } finally {
            available.push(browserPage);
            inFlight--;
          }
        })();
      }
    }

    await schedule();

    // Drain any still-running tasks before closing the browser
    while (inFlight > 0) await sleep(50);

    await Promise.all(pool.map((p) => p.close()));
  } finally {
    await browser.close();
  }

  const aiScore = scoreAiSeo(robots, sitemap, llmsTxt, pages);
  return { pages, robots, sitemap, llmsTxt, aiScore };
}
