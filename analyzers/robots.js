import axios from 'axios';
import robotsParser from 'robots-parser';

/**
 * All major AI crawlers as of 2026. Checked against multiple representative
 * paths — a bot could be allowed at / but blocked at /blog/*.
 */
const AI_BOTS = [
  'GPTBot',           // OpenAI training crawler
  'OAI-SearchBot',    // OpenAI search (distinct from GPTBot)
  'ChatGPT-User',     // ChatGPT browsing plugin
  'PerplexityBot',    // Perplexity AI
  'ClaudeBot',        // Anthropic training crawler
  'anthropic-ai',     // Anthropic (alternate UA)
  'Google-Extended',  // Google Gemini/Bard training opt-out
  'Bingbot',          // Bing (feeds Copilot)
  'CCBot',            // Common Crawl (feeds many LLMs)
  'Applebot-Extended', // Apple Intelligence
  'meta-externalagent', // Meta AI
  'AI2Bot',           // Allen Institute for AI
  'Bytespider',       // ByteDance / TikTok AI
  'cohere-ai',        // Cohere
  'YouBot',           // You.com
  'DuckDuckBot',      // DuckDuckGo AI
];

/** Paths to check — catches bots blocked only on content sections */
const CHECK_PATHS = ['/', '/blog/', '/products/', '/docs/', '/about/'];

export async function analyzeRobots(origin) {
  const url = `${origin}/robots.txt`;
  try {
    const response = await axios.get(url, { timeout: 5000 });
    const raw = response.data;
    const robots = robotsParser(url, raw);

    const aiBots = {};
    for (const bot of AI_BOTS) {
      const blockedPaths = CHECK_PATHS.filter((p) => robots.isAllowed(p, bot) === false);
      if (blockedPaths.length === 0) {
        aiBots[bot] = 'allowed';
      } else if (blockedPaths.length === CHECK_PATHS.length) {
        aiBots[bot] = 'blocked';
      } else {
        // Allowed at root but blocked on some content paths
        aiBots[bot] = 'partial';
      }
    }

    // Collect ALL Sitemap directives (sites can declare multiple)
    const sitemapMatches = [...raw.matchAll(/^Sitemap:\s*(.+)$/gim)];
    const sitemapDeclared = sitemapMatches.map((m) => m[1].trim());

    return {
      exists: true,
      raw,
      sitemapDeclared: sitemapDeclared.length > 0 ? sitemapDeclared : null,
      aiBots,
    };
  } catch {
    const aiBots = {};
    for (const bot of AI_BOTS) {
      aiBots[bot] = 'not found';
    }
    return { exists: false, raw: null, sitemapDeclared: null, aiBots };
  }
}
