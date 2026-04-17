import axios from 'axios';

/**
 * Analyzes /llms.txt and /llms-full.txt — the emerging standard for telling
 * LLMs what your site contains and how to use it (analogous to robots.txt).
 * Spec: https://llmstxt.org
 */
export async function analyzeLlmsTxt(origin) {
  const result = {
    exists: false,
    fullExists: false,
    url: null,
    sizeBytes: 0,
    hasTitle: false,
    sectionCount: 0,
    blockCount: 0,
    raw: null,
  };

  // Check /llms-full.txt first (parallel, independent)
  const [mainRes, fullRes] = await Promise.allSettled([
    axios.get(`${origin}/llms.txt`, { timeout: 5000, responseType: 'text' }),
    axios.get(`${origin}/llms-full.txt`, { timeout: 5000, responseType: 'text' }),
  ]);

  if (fullRes.status === 'fulfilled' && fullRes.value.status < 400) {
    result.fullExists = true;
  }

  if (mainRes.status === 'fulfilled' && mainRes.value.status < 400) {
    const text = String(mainRes.value.data);
    result.exists = true;
    result.url = `${origin}/llms.txt`;
    result.raw = text;
    result.sizeBytes = Buffer.byteLength(text, 'utf8');

    // Title: a markdown H1 at the very top (# Site Name)
    result.hasTitle = /^#\s+\S/m.test(text);

    // Sections: ## headings define content areas
    const sectionMatches = text.match(/^##\s+\S/gm);
    result.sectionCount = sectionMatches ? sectionMatches.length : 0;

    // Blocked entries: lines with "> X " prefix (llmstxt.org block syntax)
    const blockMatches = text.match(/^>\s*X\s+/gm);
    result.blockCount = blockMatches ? blockMatches.length : 0;
  }

  return result;
}
