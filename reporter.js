import chalk from 'chalk';
import Table from 'cli-table3';

// ── Colour helpers ───────────────────────────────────────────────────────────

function scoreColor(score, max) {
  const pct = score / max;
  if (pct >= 0.75) return chalk.green(score);
  if (pct >= 0.50) return chalk.yellow(score);
  return chalk.red(score);
}

function gradeColor(grade) {
  if (grade === 'A') return chalk.bgGreen.black(` ${grade} `);
  if (grade === 'B') return chalk.bgCyan.black(` ${grade} `);
  if (grade === 'C') return chalk.bgYellow.black(` ${grade} `);
  return chalk.bgRed.white(` ${grade} `);
}

function botStatus(status) {
  if (status === 'allowed') return chalk.green('✅ allowed');
  if (status === 'blocked') return chalk.red('❌ blocked');
  if (status === 'partial') return chalk.yellow('⚠  partial');
  return chalk.dim('— not found');
}

function renderTimeStr(ms) {
  if (!ms) return chalk.dim('-');
  if (ms < 1000) return chalk.green(`${ms}ms`);
  if (ms < 3000) return chalk.yellow(`${(ms / 1000).toFixed(1)}s`);
  return chalk.red(`${(ms / 1000).toFixed(1)}s`);
}

// ── Main report ──────────────────────────────────────────────────────────────

export function printReport(data) {
  const { pages, robots, sitemap, llmsTxt, aiScore } = data;
  const { scores, grade, issues: scoreIssues } = aiScore;
  const crawledUrl = pages[0]?.url || 'unknown';
  const validPages = pages.filter((p) => !p.error);

  // ── Header ───────────────────────────────────────────────────
  console.log('\n' + chalk.bold.bgBlue.white('  AI SEO CRAWLER REPORT  '));
  console.log(chalk.dim(`URL: ${crawledUrl}`));
  console.log(chalk.dim(`Date: ${new Date().toISOString()}`));
  console.log(chalk.dim(`Pages crawled: ${validPages.length} / ${pages.length}`));
  console.log();

  // ── Score summary ─────────────────────────────────────────────
  console.log(chalk.bold('━━━ AI SEO SCORE ━━━'));
  console.log(`Total: ${scoreColor(scores.total, 100)} / 100   Grade: ${gradeColor(grade)}`);
  const scoreTable = new Table({ head: ['Category', 'Score', 'Max'] });
  scoreTable.push(
    ['robots.txt',          scoreColor(scores.robots,    15), 15],
    ['llms.txt',            scoreColor(scores.llmsTxt,   10), 10],
    ['sitemap.xml',         scoreColor(scores.sitemap,   15), 15],
    ['Semantics (avg+worst)',scoreColor(scores.semantics, 25), 25],
    ['Schema Quality',      scoreColor(scores.schema,    20), 20],
    ['E-E-A-T',             scoreColor(scores.eeat,      15), 15],
  );
  console.log(scoreTable.toString());
  console.log();

  // ── llms.txt ──────────────────────────────────────────────────
  console.log(chalk.bold('━━━ LLMS.TXT ━━━'));
  if (llmsTxt.exists) {
    console.log(chalk.green(`✅ Found at ${llmsTxt.url}`));
    console.log(`  Size:     ${(llmsTxt.sizeBytes / 1024).toFixed(1)} KB`);
    console.log(`  Title:    ${llmsTxt.hasTitle ? chalk.green('yes') : chalk.red('no (add # Site Name at top)')}`);
    console.log(`  Sections: ${llmsTxt.sectionCount > 0 ? chalk.green(llmsTxt.sectionCount) : chalk.red('0 (add ## Section headings)')}`);
    if (llmsTxt.fullExists) {
      console.log(`  ` + chalk.green('✅ /llms-full.txt also present'));
    } else {
      console.log(`  ` + chalk.dim('ℹ  /llms-full.txt not found (optional extended version)'));
    }
  } else {
    console.log(chalk.red('❌ /llms.txt not found'));
    console.log(chalk.dim('  llms.txt tells AI models what your site contains and how to use it.'));
    console.log(chalk.dim('  See https://llmstxt.org for the spec.'));
  }
  console.log();

  // ── robots.txt ────────────────────────────────────────────────
  console.log(chalk.bold('━━━ ROBOTS.TXT ━━━'));
  if (robots.exists) {
    console.log(chalk.green('✅ robots.txt found'));
    if (robots.sitemapDeclared?.length) {
      for (const s of robots.sitemapDeclared) {
        console.log(`  Sitemap: ${s}`);
      }
    }
    const botsTable = new Table({ head: ['AI Bot', 'Status', 'Coverage'] });
    for (const [bot, status] of Object.entries(robots.aiBots)) {
      const coverage = status === 'partial' ? chalk.dim('blocked on some paths') : '';
      botsTable.push([bot, botStatus(status), coverage]);
    }
    console.log(botsTable.toString());
  } else {
    console.log(chalk.yellow('⚠  robots.txt not found — AI bots use default allow-all'));
  }
  console.log();

  // ── sitemap.xml ───────────────────────────────────────────────
  console.log(chalk.bold('━━━ SITEMAP.XML ━━━'));
  if (sitemap.found) {
    console.log(chalk.green(`✅ Found at ${sitemap.path}`));
    if (sitemap.isSitemapIndex) {
      console.log(`  Type: Sitemap Index (${sitemap.childSitemapCount} child sitemaps)`);
      console.log(`  URLs: ~${sitemap.urlCount.toLocaleString()} (estimated from sampled children)`);
    } else {
      console.log(`  Type: URL Set`);
      console.log(`  URLs: ${sitemap.urlCount.toLocaleString()}`);
    }
    console.log(`  <lastmod>:    ${sitemap.hasLastmod   ? chalk.green('yes') : chalk.red('no')}`);
    console.log(`  <changefreq>: ${sitemap.hasChangefreq ? chalk.green('yes') : chalk.dim('no')}`);
    console.log(`  <priority>:   ${sitemap.hasPriority   ? chalk.green('yes') : chalk.dim('no')}`);
  } else {
    console.log(chalk.red('❌ sitemap.xml not found'));
  }
  console.log();

  // ── E-E-A-T signals ───────────────────────────────────────────
  console.log(chalk.bold('━━━ E-E-A-T SIGNALS ━━━'));
  const hasAuthor  = validPages.some((p) => p.semantics?.eeat?.hasAuthor);
  const hasOrg     = validPages.some((p) => p.semantics?.eeat?.hasOrganization);
  const hasDates   = validPages.some((p) => p.semantics?.eeat?.hasPublishDate);
  const hasAbout   = validPages.some((p) => p.semantics?.eeat?.hasAboutLink);
  const hasContact = validPages.some((p) => p.semantics?.eeat?.hasContactLink);

  const eeatTable = new Table({ head: ['Signal', 'Status', 'Fix'] });
  eeatTable.push(
    ['Author attribution', hasAuthor  ? chalk.green('✅') : chalk.red('❌'), hasAuthor  ? 'Found' : 'Add author schema or meta[name="author"]'],
    ['Organization schema', hasOrg    ? chalk.green('✅') : chalk.red('❌'), hasOrg     ? 'Found' : 'Add Organization JSON-LD'],
    ['Content dates',       hasDates  ? chalk.green('✅') : chalk.red('❌'), hasDates   ? 'Found' : 'Add article:published_time or time[datetime]'],
    ['About page link',     hasAbout  ? chalk.green('✅') : chalk.red('❌'), hasAbout   ? 'Detected' : 'Add /about page with nav link'],
    ['Contact page link',   hasContact? chalk.green('✅') : chalk.red('❌'), hasContact ? 'Detected' : 'Add /contact page with nav link'],
  );
  console.log(eeatTable.toString());
  console.log();

  // ── Pages audit ───────────────────────────────────────────────
  console.log(chalk.bold('━━━ PAGES AUDIT ━━━'));
  const pagesTable = new Table({
    head: ['URL Path', 'H1', 'Meta', 'Canon', 'Schema Types', 'Words', 'Time', 'Issues'],
    colWidths: [28, 5, 6, 7, 18, 7, 7, 7],
    wordWrap: true,
  });

  for (const page of pages) {
    const path = (page.url || '').replace(/^https?:\/\/[^/]+/, '') || '/';
    const truncPath = path.length > 26 ? path.slice(0, 23) + '…' : path;

    if (page.error) {
      pagesTable.push([
        chalk.dim(truncPath),
        chalk.dim('—'), chalk.dim('—'), chalk.dim('—'),
        chalk.dim(page.error),
        '—', renderTimeStr(page.renderTime), '—',
      ]);
      continue;
    }

    const s = page.semantics;
    const h1cell    = s.headings.h1.length === 1 ? chalk.green('✅') : chalk.red(`${s.headings.h1.length}`);
    const metaCell  = s.meta.description ? chalk.green('✅') : chalk.red('❌');
    const canonCell = s.meta.canonical   ? chalk.green('✅') : chalk.red('❌');
    const schemaStr = s.schemaTypes.length > 0 ? s.schemaTypes.slice(0, 2).join(', ') + (s.schemaTypes.length > 2 ? '…' : '') : chalk.dim('none');
    const issueCell = s.issues.length > 0 ? chalk.red(s.issues.length) : chalk.green('0');

    pagesTable.push([truncPath, h1cell, metaCell, canonCell, schemaStr, s.content.wordCount, renderTimeStr(page.renderTime), issueCell]);
  }
  console.log(pagesTable.toString());
  console.log();

  // ── Top issues ────────────────────────────────────────────────
  console.log(chalk.bold('━━━ TOP ISSUES ━━━'));
  const issueCounts = {};
  for (const page of pages) {
    for (const issue of page.semantics?.issues || []) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }
  const sortedIssues = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]);

  if (sortedIssues.length === 0 && scoreIssues.length === 0) {
    console.log(chalk.green('No major issues found!'));
  } else {
    for (const [issue, count] of sortedIssues) {
      console.log(`  ${chalk.red('•')} ${issue} ${chalk.dim(`(${count} page${count > 1 ? 's' : ''})`)}`);
    }
    for (const issue of scoreIssues) {
      console.log(`  ${chalk.red('•')} ${issue}`);
    }
  }
  console.log();

  // ── Recommendations ───────────────────────────────────────────
  console.log(chalk.bold('━━━ RECOMMENDATIONS ━━━'));
  const recs = buildRecommendations(robots, sitemap, llmsTxt, sortedIssues);
  if (recs.length === 0) {
    console.log(chalk.green('Great job! No critical recommendations.'));
  } else {
    for (const rec of recs) {
      console.log(`  ${chalk.cyan('→')} ${rec}`);
    }
  }
  console.log();
}

// ── Recommendation builder ───────────────────────────────────────────────────

function buildRecommendations(robots, sitemap, llmsTxt, sortedIssues) {
  const recs = [];

  // llms.txt — most impactful AI-specific fix, lead with it
  if (!llmsTxt.exists) {
    recs.push('Create /llms.txt — a structured guide for AI models on your content. See llmstxt.org for the spec.');
  } else {
    if (!llmsTxt.hasTitle) recs.push('Add a title to llms.txt: start the file with "# Your Site Name" on the first line.');
    if (llmsTxt.sectionCount === 0) recs.push('Add content sections to llms.txt using "## Section Name" headings.');
    if (!llmsTxt.fullExists) recs.push('Consider adding /llms-full.txt with the complete text of your key pages for AI models that request more context.');
  }

  // robots.txt
  if (!robots.exists) {
    recs.push('Add a robots.txt file to explicitly grant AI crawlers access.');
  } else {
    const blocked = Object.entries(robots.aiBots).filter(([, v]) => v === 'blocked').map(([k]) => k);
    const partial = Object.entries(robots.aiBots).filter(([, v]) => v === 'partial').map(([k]) => k);
    if (blocked.length > 0) recs.push(`Unblock AI crawlers in robots.txt: ${blocked.join(', ')}`);
    if (partial.length > 0) recs.push(`Fix partial AI crawler blocks (check path-specific Disallow rules): ${partial.join(', ')}`);
    if (!robots.sitemapDeclared?.length && sitemap.found) {
      recs.push('Add a "Sitemap: <url>" directive to robots.txt to help AI crawlers find your sitemap.');
    }
  }

  // sitemap
  if (!sitemap.found) recs.push('Create and submit a sitemap.xml to improve AI and search engine discoverability.');
  if (sitemap.found && !sitemap.hasLastmod) recs.push('Add <lastmod> dates to sitemap.xml — freshness signals matter for AI crawler prioritisation.');

  // Per-page issue recommendations
  const issueRecs = {
    'Missing html lang attribute': 'Add lang="en" (or the correct BCP-47 code) to your <html> tag.',
    'Missing H1': 'Add a single, descriptive H1 heading to each page.',
    'Multiple H1s': 'Remove extra H1 tags — each page should have exactly one.',
    'Missing meta description': 'Write a unique meta description (50–160 chars) for each page.',
    'Meta description too short': 'Expand your meta description to at least 50 characters.',
    'Meta description too long': 'Trim your meta description to under 160 characters.',
    'Missing canonical URL': 'Add <link rel="canonical"> to prevent duplicate-content dilution.',
    'Missing OG tags': 'Add og:title and og:description — social and AI previews depend on them.',
    'No schema markup': 'Add JSON-LD structured data (Article, FAQPage, Organization) to every page.',
    'Missing viewport': 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    'images missing alt text': 'Add descriptive alt text to all images — required for AI image understanding.',
    'Low word count': 'Expand page content to at least 300 words for meaningful AI and search visibility.',
    'Page may be noindex': 'Remove noindex unless you intentionally exclude this page from search.',
    'Heading hierarchy skips': 'Fix heading structure — never skip from H1 to H3 without an H2.',
  };

  const seen = new Set();
  for (const [issue] of sortedIssues) {
    for (const [key, rec] of Object.entries(issueRecs)) {
      if (issue.includes(key) && !seen.has(key)) {
        recs.push(rec);
        seen.add(key);
        break;
      }
    }
  }

  return recs;
}

// ── JSON export ──────────────────────────────────────────────────────────────

export function toJson(data) {
  return JSON.stringify(data, null, 2);
}
