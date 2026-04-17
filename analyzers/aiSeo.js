/**
 * AI SEO Scoring Engine — 100-point scale across 6 categories.
 *
 * robots.txt   15 pts  Bot access control (existence alone is not enough)
 * llms.txt     10 pts  LLM-specific content guide (/llms.txt standard)
 * sitemap.xml  15 pts  Crawlability and freshness signals
 * Semantics    25 pts  Per-page HTML quality (worst-page weighted)
 * Schema       20 pts  JSON-LD structured data quality and coverage
 * E-E-A-T      15 pts  Experience, Expertise, Authority, Trustworthiness
 * ─────────────────────────────────────────────────────────────
 * Total       100 pts
 */
export function scoreAiSeo(robotsData, sitemapData, llmsData, pages) {
  let robotsScore = 0;
  let llmsScore = 0;
  let sitemapScore = 0;
  let semanticsScore = 0;
  let schemaScore = 0;
  let eeatScore = 0;
  const issues = [];

  // ── robots.txt (15 pts) ──────────────────────────────────────
  // Existence without AI access is worth very little — penalise blocking
  const keyBots = ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'];
  if (robotsData.exists) {
    const blocked = keyBots.filter((b) => robotsData.aiBots[b] === 'blocked');
    const partial = keyBots.filter((b) => robotsData.aiBots[b] === 'partial');

    if (blocked.length === 0 && partial.length === 0) {
      robotsScore = 13; // clean: all key bots fully allowed
    } else if (blocked.length === 0) {
      robotsScore = 9;  // partial blocks on some paths
      issues.push(`AI bots have partial access (blocked on some paths): ${partial.join(', ')}`);
    } else {
      robotsScore = 4;  // actively blocking key bots — big penalty
      issues.push(`Key AI bots blocked in robots.txt: ${blocked.join(', ')}`);
    }

    // Bonus: sitemap declared in robots.txt
    if (robotsData.sitemapDeclared?.length) robotsScore = Math.min(robotsScore + 2, 15);
  } else {
    // No robots.txt — AI bots use default allow-all, so not catastrophic
    robotsScore = 5;
    issues.push('robots.txt not found — AI bot access relies on default allow-all behavior');
  }

  // ── llms.txt (10 pts) ────────────────────────────────────────
  if (llmsData.exists) {
    llmsScore += 6;                          // file exists
    if (llmsData.hasTitle) llmsScore += 2;   // has a site title/description
    if (llmsData.sectionCount > 0) llmsScore += 1; // structured with sections
    if (llmsData.fullExists) llmsScore += 1; // full version also available
  } else {
    issues.push('llms.txt not found — add /llms.txt to guide AI models on your content');
  }

  // ── sitemap.xml (15 pts) ─────────────────────────────────────
  if (sitemapData.found) {
    sitemapScore += 6;
    if (sitemapData.urlCount > 0) sitemapScore += 4;
    if (sitemapData.hasLastmod) sitemapScore += 3;
    if (robotsData.sitemapDeclared?.length) sitemapScore += 2;
  } else {
    issues.push('sitemap.xml not found — AI crawlers rely on sitemaps for discovery');
  }

  // ── Per-page semantics (25 pts) ──────────────────────────────
  // Max per page = 24, scaled to 25.
  // Blend: 60% average + 40% worst page — penalises outlier bad pages
  // (a broken homepage drags the score even if other pages are perfect)
  const validPages = pages.filter((p) => !p.error && p.semantics);
  if (validPages.length > 0) {
    const pageScores = validPages.map((page) => {
      const s = page.semantics;
      let score = 0;
      if (s.headings.h1.length === 1) score += 6;
      if (s.meta.description && s.meta.description.length >= 50 && s.meta.description.length <= 160) score += 6;
      if (s.meta.canonical) score += 3;
      if (s.meta.ogTitle && s.meta.ogDescription) score += 3;
      if (s.content.wordCount >= 300) score += 4;
      if (s.meta.lang) score += 1;
      if (s.performance.hasViewport) score += 1;
      return Math.min(score, 24);
    });

    const avg = pageScores.reduce((a, b) => a + b, 0) / pageScores.length;
    const worst = Math.min(...pageScores);
    const blended = avg * 0.6 + worst * 0.4;
    semanticsScore = Math.round((blended / 24) * 25);
  }

  // ── Schema quality (20 pts) ──────────────────────────────────
  // Scored on schema TYPE value — not mere presence (semantics already handles that).
  // Foundation: who are you?  Content: what do you publish?  Answer: cite-worthy?
  const allTypes = new Set(pages.flatMap((p) => p.semantics?.schemaTypes || []));

  // Foundation schemas (7 pts)
  if (allTypes.has('Organization') || allTypes.has('LocalBusiness')) schemaScore += 5;
  if (allTypes.has('WebSite')) schemaScore += 1;
  if (allTypes.has('BreadcrumbList')) schemaScore += 1;

  // Content schemas (5 pts)
  const contentTypes = ['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'];
  if (contentTypes.some((t) => allTypes.has(t))) schemaScore += 5;

  // Answer/citation schemas (8 pts) — highest value for AI visibility
  if (allTypes.has('FAQPage')) schemaScore += 5;
  if (allTypes.has('HowTo')) schemaScore += 3;

  schemaScore = Math.min(schemaScore, 20);
  if (schemaScore === 0) issues.push('No structured schema markup (JSON-LD) found on any page');

  // ── E-E-A-T (15 pts) ─────────────────────────────────────────
  // Aggregated site-level trust signals — AI citation engines weight these heavily
  const hasAuthor = validPages.some((p) => p.semantics?.eeat?.hasAuthor);
  const hasOrg = validPages.some((p) => p.semantics?.eeat?.hasOrganization);
  const hasDates = validPages.some((p) => p.semantics?.eeat?.hasPublishDate);
  const hasAbout = validPages.some((p) => p.semantics?.eeat?.hasAboutLink);
  const hasContact = validPages.some((p) => p.semantics?.eeat?.hasContactLink);

  if (hasAuthor) eeatScore += 4;
  if (hasOrg) eeatScore += 3;
  if (hasDates) eeatScore += 3;
  if (hasAbout) eeatScore += 3;
  if (hasContact) eeatScore += 2;

  if (!hasAuthor && !hasOrg) issues.push('No author or organization attribution found on any page');
  if (!hasDates) issues.push('No content publish dates found — freshness signals missing for AI ranking');
  if (!hasAbout) issues.push('No About page link detected — reduces trust signals for AI citation');

  // ── Final score and grade ────────────────────────────────────
  const total = robotsScore + llmsScore + sitemapScore + semanticsScore + schemaScore + eeatScore;

  let grade;
  if (total >= 88) grade = 'A';
  else if (total >= 72) grade = 'B';
  else if (total >= 55) grade = 'C';
  else if (total >= 38) grade = 'D';
  else grade = 'F';

  return {
    scores: { robots: robotsScore, llmsTxt: llmsScore, sitemap: sitemapScore, semantics: semanticsScore, schema: schemaScore, eeat: eeatScore, total },
    grade,
    issues,
  };
}
