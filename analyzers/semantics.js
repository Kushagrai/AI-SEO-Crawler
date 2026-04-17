import * as cheerio from 'cheerio';

export function analyzeSemantics(html, pageUrl) {
  const $ = cheerio.load(html);

  // ── HTML lang attribute ──────────────────────────────────────
  // Required for AI language identification and accessibility
  const lang = $('html').attr('lang') || null;

  // ── Meta tags ────────────────────────────────────────────────
  const title = $('title').first().text().trim() || null;
  const description = $('meta[name="description"]').attr('content') || null;
  const ogTitle = $('meta[property="og:title"]').attr('content') || null;
  const ogDescription = $('meta[property="og:description"]').attr('content') || null;
  const ogImage = $('meta[property="og:image"]').attr('content') || null;
  const canonical = $('link[rel="canonical"]').attr('href') || null;
  const robotsMeta = $('meta[name="robots"]').attr('content') || null;
  const viewport = $('meta[name="viewport"]').attr('content') || null;
  const charset = $('meta[charset]').attr('charset') || null;

  const hreflang = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    hreflang.push({ hreflang: $(el).attr('hreflang'), href: $(el).attr('href') });
  });

  // ── Heading structure ────────────────────────────────────────
  const h1 = $('h1').map((_, el) => $(el).text().trim()).get();
  const h2 = $('h2').map((_, el) => $(el).text().trim()).get();
  const h3 = $('h3').map((_, el) => $(el).text().trim()).get();
  const h4 = $('h4').map((_, el) => $(el).text().trim()).get();

  let hierarchy = 'valid';
  if (h1.length === 0) {
    hierarchy = 'missing-h1';
  } else if (h1.length > 1) {
    hierarchy = 'multiple-h1';
  } else {
    const allHeadings = [];
    $('h1,h2,h3,h4,h5,h6').each((_, el) => {
      allHeadings.push(parseInt(el.tagName.replace('h', ''), 10));
    });
    for (let i = 1; i < allHeadings.length; i++) {
      if (allHeadings[i] - allHeadings[i - 1] > 1) {
        hierarchy = 'skipped-levels';
        break;
      }
    }
  }

  // ── JSON-LD Schema markup ────────────────────────────────────
  const schemas = [];
  const schemaTypes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const obj = JSON.parse($(el).html());
      // Normalize to a flat list: handles top-level array, @graph wrapper, and single object
      const items = Array.isArray(obj) ? obj : obj['@graph'] ? obj['@graph'] : [obj];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        schemas.push(item);
        const rawType = item['@type'];
        if (rawType) {
          // @type can be a string or an array of strings
          schemaTypes.push(...(Array.isArray(rawType) ? rawType : [rawType]));
        }
      }
    } catch {
      // skip invalid JSON-LD
    }
  });

  // ── HTML5 semantic tags ──────────────────────────────────────
  const semanticTags = {
    article: $('article').length,
    main: $('main').length,
    nav: $('nav').length,
    header: $('header').length,
    footer: $('footer').length,
    section: $('section').length,
    aside: $('aside').length,
    figure: $('figure').length,
    time: $('time').length,
  };

  // ── Link analysis ────────────────────────────────────────────
  const baseOrigin = new URL(pageUrl).origin;
  let internalLinks = 0;
  let externalLinks = 0;
  let hasAboutLink = false;
  let hasContactLink = false;

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().toLowerCase();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.origin === baseOrigin) {
        internalLinks++;
      } else {
        externalLinks++;
      }
    } catch {
      // skip invalid URLs
    }

    // About / Contact detection (nav links, footer links, etc.)
    if (/\babout\b/.test(text) || /\/about(\/|$)/.test(href)) hasAboutLink = true;
    if (/\bcontact\b/.test(text) || /\/contact(\/|$)/.test(href)) hasContactLink = true;
  });

  // ── Image analysis ───────────────────────────────────────────
  let totalImages = 0;
  let missingAlt = 0;
  let lazyLoaded = 0;
  $('img').each((_, el) => {
    totalImages++;
    const alt = $(el).attr('alt');
    if (alt === undefined || alt === null) missingAlt++;
    if ($(el).attr('loading') === 'lazy') lazyLoaded++;
  });

  // ── Word count (main content only) ──────────────────────────
  // Avoid inflating count with nav, footer, sidebars, cookie banners
  const $mainEl = $('main, [role="main"], article').first();
  const $contentRoot = $mainEl.length ? $mainEl.clone() : $('body').clone();
  $contentRoot.find('nav, header, footer, aside, script, style, noscript').remove();
  const contentText = $contentRoot.text().replace(/\s+/g, ' ').trim();
  const wordCount = contentText.split(' ').filter((w) => w.length > 0).length;

  // ── Content structure signals ────────────────────────────────
  const hasFaq =
    $('[itemtype*="FAQPage"]').length > 0 ||
    schemaTypes.includes('FAQPage') ||
    $('*').filter((_, el) => /faq/i.test($(el).attr('class') || '') || /faq/i.test($(el).attr('id') || '')).length > 0;

  // Fixed: extract the heading check before the boolean expression to avoid
  // operator-precedence bug where && binds tighter than expected
  const hasHowToHeading = $('h2, h3').filter((_, el) => /how[\s-]to/i.test($(el).text())).length > 0;
  const hasHowTo = schemaTypes.includes('HowTo') || ($('ol').length > 0 && hasHowToHeading);

  const hasTable = $('table').length > 0;
  const hasOrderedList = $('ol').length > 0;
  const hasDefinitionList = $('dl').length > 0;

  // ── Content freshness ────────────────────────────────────────
  const publishDate =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="date"]').attr('content') ||
    $('time[datetime]').first().attr('datetime') ||
    null;
  const modifiedDate =
    $('meta[property="article:modified_time"]').attr('content') ||
    $('meta[name="last-modified"]').attr('content') ||
    null;

  // ── E-E-A-T signals ──────────────────────────────────────────
  // Experience, Expertise, Authoritativeness, Trustworthiness
  const hasAuthorSchema = schemaTypes.some((t) => t === 'Person' || t === 'Author');
  const hasAuthorMeta =
    !!$('meta[name="author"]').attr('content') ||
    $('[rel="author"]').length > 0 ||
    $('[itemprop="author"]').length > 0;
  const hasAuthor = hasAuthorSchema || hasAuthorMeta;

  const hasOrganization =
    schemaTypes.includes('Organization') ||
    schemaTypes.includes('LocalBusiness') ||
    $('[itemtype*="Organization"]').length > 0;

  const eeat = {
    hasAuthor,
    hasOrganization,
    hasPublishDate: !!publishDate,
    hasAboutLink,
    hasContactLink,
  };

  // ── Issues list ──────────────────────────────────────────────
  const issues = [];
  if (!lang) issues.push('Missing html lang attribute');
  if (h1.length === 0) issues.push('Missing H1');
  if (h1.length > 1) issues.push(`Multiple H1s (${h1.length})`);
  if (hierarchy === 'skipped-levels') issues.push('Heading hierarchy skips levels');
  if (!description) issues.push('Missing meta description');
  else if (description.length < 50) issues.push('Meta description too short (<50 chars)');
  else if (description.length > 160) issues.push('Meta description too long (>160 chars)');
  if (!canonical) issues.push('Missing canonical URL');
  if (!ogTitle || !ogDescription) issues.push('Missing OG tags (og:title / og:description)');
  if (schemas.length === 0) issues.push('No schema markup (JSON-LD)');
  if (!viewport) issues.push('Missing viewport meta tag');
  if (missingAlt > 0) issues.push(`${missingAlt} images missing alt text`);
  if (wordCount < 300) issues.push('Low word count (<300 words)');
  if (robotsMeta && /noindex/i.test(robotsMeta)) issues.push('Page may be noindex');

  return {
    meta: { title, description, ogTitle, ogDescription, ogImage, canonical, robots: robotsMeta, viewport, charset, hreflang, lang },
    headings: { h1, h2, h3, h4, hierarchy },
    schemas,
    schemaTypes,
    semanticTags,
    links: { internal: internalLinks, external: externalLinks },
    images: { total: totalImages, missingAlt, lazyLoaded },
    content: { wordCount, hasFaq, hasHowTo, hasTable, hasOrderedList, hasDefinitionList },
    freshness: { publishDate, modifiedDate },
    eeat,
    performance: { hasViewport: !!viewport, hasCharset: !!charset },
    issues,
  };
}
