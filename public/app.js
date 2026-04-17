/* ─── DOM refs ────────────────────────────────────────── */
const urlInput        = document.getElementById('url-input');
const depthSelect     = document.getElementById('depth-select');
const pagesSelect     = document.getElementById('pages-select');
const concSelect      = document.getElementById('conc-select');
const crawlBtn        = document.getElementById('crawl-btn');
const progressSection = document.getElementById('progress-section');
const progressBar     = document.getElementById('progress-bar');
const progressText    = document.getElementById('progress-text');
const resultsSection  = document.getElementById('results-section');

let eventSource = null;
let _pages      = [];   // stored for expandable detail rows

/* ─── Events ──────────────────────────────────────────── */
crawlBtn.addEventListener('click', startCrawl);
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startCrawl(); });

/* ─── Crawl ───────────────────────────────────────────── */
function startCrawl() {
  let raw = urlInput.value.trim();
  if (!raw) { urlInput.focus(); return; }

  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  urlInput.value = raw;

  let url;
  try { url = new URL(raw).href; }
  catch {
    urlInput.style.outline = '3px solid #FF2525';
    setTimeout(() => (urlInput.style.outline = ''), 1200);
    return;
  }

  if (eventSource) { eventSource.close(); eventSource = null; }
  if (typeof window.catSpawn === 'function') window.catSpawn();

  crawlBtn.disabled = true;
  progressSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  progressBar.style.width = '5%';
  progressText.textContent = 'CONNECTING...';

  const depth    = depthSelect.value;
  const maxPages = pagesSelect.value;
  const conc     = concSelect.value;
  const qs       = `url=${encodeURIComponent(url)}&depth=${depth}&maxPages=${maxPages}&concurrency=${conc}`;
  eventSource    = new EventSource(`/api/crawl?${qs}`);

  eventSource.addEventListener('progress', (e) => {
    const { url: pageUrl, count } = JSON.parse(e.data);
    progressBar.style.width = `${Math.min(10 + (count + 1) * 4, 88)}%`;
    progressText.textContent = `CRAWLING [${count + 1}]: ${pageUrl}`;
  });

  eventSource.addEventListener('complete', (e) => {
    const data = JSON.parse(e.data);
    progressBar.style.width = '100%';
    progressText.textContent = `DONE — ${data.pages.length} PAGE${data.pages.length !== 1 ? 'S' : ''} CRAWLED`;

    if (typeof window.catEscape === 'function') window.catEscape();

    setTimeout(() => {
      progressSection.classList.add('hidden');
      renderResults(data, url);
      resultsSection.classList.remove('hidden');
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 1100);

    crawlBtn.disabled = false;
    eventSource.close(); eventSource = null;
  });

  // Server sends 'crawl_error' for application-level failures
  eventSource.addEventListener('crawl_error', (e) => {
    let msg = 'CRAWL FAILED';
    try { msg = JSON.parse(e.data).message.toUpperCase(); } catch {}
    progressText.textContent = `ERROR: ${msg}`;
    progressBar.style.width = '0%';
    crawlBtn.disabled = false;
    eventSource.close(); eventSource = null;
  });

  eventSource.onerror = () => {
    if (!eventSource || eventSource.readyState === EventSource.CLOSED) return;
    progressText.textContent = 'CONNECTION ERROR';
    crawlBtn.disabled = false;
  };
}

/* ─── Render orchestrator ─────────────────────────────── */
function renderResults(data, inputUrl) {
  const { aiScore, robots, sitemap, llmsTxt, pages } = data;
  _pages = pages;

  renderMeta(pages, inputUrl);
  renderScores(aiScore);
  renderInfrastructure(robots, sitemap);
  renderLlmsTxt(llmsTxt || { exists: false });
  renderEeat(pages);

  const aggregatedIssues = aggregatePageIssues(pages);
  renderTopIssues(aggregatedIssues, aiScore.issues);
  renderRecommendations(robots, sitemap, llmsTxt || { exists: false }, aggregatedIssues);
  renderPages(pages);
}

/* ─── Crawl metadata bar ──────────────────────────────── */
function renderMeta(pages, url) {
  const valid  = pages.filter(p => !p.error).length;
  const errors = pages.filter(p =>  p.error).length;
  document.getElementById('meta-url').textContent   = url;
  document.getElementById('meta-date').textContent  = new Date().toLocaleString();
  document.getElementById('meta-pages').textContent = `${valid} / ${pages.length}`;
  const errEl = document.getElementById('meta-errors');
  errEl.textContent = errors;
  errEl.style.color = errors > 0 ? '#FF2525' : '#00C96B';
}

/* ─── Score hero + 6 category cards ──────────────────── */
function renderScores(aiScore) {
  const { scores, grade } = aiScore;

  document.getElementById('score-total').textContent = scores.total;
  const gradeBadge = document.getElementById('grade-badge');
  gradeBadge.textContent = grade;
  gradeBadge.className   = `grade-badge grade-${grade}`;
  document.getElementById('score-grade-desc').textContent = gradeDesc(grade);

  setScore('score-robots',    'card-robots',    scores.robots,    15);
  setScore('score-llmstxt',   'card-llmstxt',   scores.llmsTxt,   10);
  setScore('score-sitemap',   'card-sitemap',   scores.sitemap,   15);
  setScore('score-semantics', 'card-semantics', scores.semantics, 25);
  setScore('score-schema',    'card-schema',    scores.schema,    20);
  setScore('score-eeat',      'card-eeat',      scores.eeat,      15);
}

function gradeDesc(grade) {
  return {
    A: 'EXCELLENT AI VISIBILITY',
    B: 'GOOD AI VISIBILITY',
    C: 'FAIR — IMPROVEMENTS NEEDED',
    D: 'POOR AI VISIBILITY',
    F: 'CRITICAL — NEEDS IMMEDIATE ATTENTION',
  }[grade] || '';
}

function setScore(numId, cardId, score, max) {
  const numEl  = document.getElementById(numId);
  const cardEl = document.getElementById(cardId);
  if (!numEl || !cardEl) return;
  numEl.textContent = score ?? '--';
  const ratio = (score ?? 0) / max;
  const color = ratio >= 0.75 ? 'var(--green)' : ratio >= 0.45 ? 'var(--orange)' : 'var(--red)';
  numEl.style.color      = color;
  cardEl.style.borderTop = `4px solid ${color}`;
}

/* ─── Infrastructure: robots + sitemap ────────────────── */
const KEY_BOTS = new Set(['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended']);

function renderInfrastructure(robots, sitemap) {
  // ── Robots header
  document.getElementById('robots-header').innerHTML = robots.exists
    ? `<span class="status-dot ok"></span><span class="status-ok">robots.txt FOUND</span>`
    : `<span class="status-dot err"></span><span class="status-err">robots.txt NOT FOUND</span>`;

  // ── Robots props — sitemapDeclared is now an array
  const robotsProps = document.getElementById('robots-props');
  if (robots.exists) {
    const sitemaps = robots.sitemapDeclared;
    const smHtml = Array.isArray(sitemaps) && sitemaps.length
      ? sitemaps.map(s => `<span style="word-break:break-all;font-size:0.72rem;display:block">${esc(s)}</span>`).join('')
      : '<span class="check no">NOT DECLARED</span>';
    robotsProps.innerHTML = propRow('SITEMAP DECLARED', smHtml);
  } else {
    robotsProps.innerHTML = propRow('STATUS', '<span class="check no">MISSING</span>');
  }

  // ── All bots grid (now 16 bots)
  const botsGrid = document.getElementById('bots-full-grid');
  botsGrid.innerHTML = Object.entries(robots.aiBots).map(([bot, status]) => {
    const statusClass = status === 'allowed' ? 'allowed'
                      : status === 'blocked' ? 'blocked'
                      : status === 'partial' ? 'partial'
                      : 'unknown';
    const label = status === 'not found' ? 'UNKNOWN' : status.toUpperCase();
    return `<div class="bot-card">
      ${KEY_BOTS.has(bot) ? '<span class="bot-key-badge">KEY</span>' : '<span style="height:1.1rem;display:block"></span>'}
      <span class="bot-name">${esc(bot)}</span>
      <span class="bot-status ${statusClass}">${label}</span>
    </div>`;
  }).join('');

  // ── Sitemap header
  document.getElementById('sitemap-header').innerHTML = sitemap.found
    ? `<span class="status-dot ok"></span><span class="status-ok">sitemap.xml FOUND</span>`
    : `<span class="status-dot err"></span><span class="status-err">sitemap.xml NOT FOUND</span>`;

  // ── Sitemap props
  const sitemapProps = document.getElementById('sitemap-props');
  if (sitemap.found) {
    const typeStr = sitemap.isSitemapIndex
      ? `SITEMAP INDEX (${sitemap.childSitemapCount} children)`
      : 'URL SET';
    const urlStr = sitemap.isSitemapIndex
      ? `~${sitemap.urlCount.toLocaleString()} (estimated)`
      : sitemap.urlCount.toLocaleString();
    sitemapProps.innerHTML = [
      propRow('PATH',              `<span style="font-size:0.75rem">${esc(sitemap.path)}</span>`),
      propRow('TYPE',              typeStr),
      propRow('URLS',              urlStr),
      propRow('&lt;LASTMOD&gt;',    check(sitemap.hasLastmod)),
      propRow('&lt;CHANGEFREQ&gt;', check(sitemap.hasChangefreq)),
      propRow('&lt;PRIORITY&gt;',   check(sitemap.hasPriority)),
    ].join('');
  } else {
    sitemapProps.innerHTML = propRow('STATUS', '<span class="check no">MISSING</span>');
  }
}

/* ─── llms.txt panel ──────────────────────────────────── */
function renderLlmsTxt(llmsTxt) {
  const header = document.getElementById('llms-header');
  const props  = document.getElementById('llms-props');

  if (llmsTxt.exists) {
    header.innerHTML = `<span class="status-dot ok"></span><span class="status-ok">/llms.txt FOUND</span>
      ${llmsTxt.fullExists ? '&nbsp;<span class="tag ok" style="font-size:0.6rem">+llms-full.txt</span>' : ''}`;
    props.innerHTML = [
      propRow('URL',      `<span style="font-size:0.72rem;word-break:break-all">${esc(llmsTxt.url)}</span>`),
      propRow('SIZE',     `${(llmsTxt.sizeBytes / 1024).toFixed(1)} KB`),
      propRow('HAS TITLE (# heading)',    check(llmsTxt.hasTitle)),
      propRow('SECTIONS (## headings)',   llmsTxt.sectionCount > 0
        ? `<span class="check yes">${llmsTxt.sectionCount}</span>`
        : '<span class="check no">0 — add ## Section headings</span>'),
      propRow('/llms-full.txt', check(llmsTxt.fullExists)),
    ].join('');
  } else {
    header.innerHTML = `<span class="status-dot err"></span><span class="status-err">/llms.txt NOT FOUND</span>`;
    props.innerHTML  = propRow(
      'ACTION REQUIRED',
      '<span style="font-size:0.75rem;color:#555">Create /llms.txt to guide AI models. See <strong>llmstxt.org</strong> for the spec.</span>',
    );
  }
}

/* ─── E-E-A-T signals panel ───────────────────────────── */
function renderEeat(pages) {
  const validPages = pages.filter(p => !p.error && p.semantics);
  const grid = document.getElementById('eeat-grid');

  const signals = [
    {
      key:   'hasAuthor',
      label: 'AUTHOR ATTRIBUTION',
      fix:   'Add author schema (Person JSON-LD) or meta[name="author"]',
    },
    {
      key:   'hasOrganization',
      label: 'ORGANIZATION SCHEMA',
      fix:   'Add Organization JSON-LD with name, url, logo',
    },
    {
      key:   'hasPublishDate',
      label: 'CONTENT DATES',
      fix:   'Add article:published_time meta or time[datetime] elements',
    },
    {
      key:   'hasAboutLink',
      label: 'ABOUT PAGE LINK',
      fix:   'Add an /about page with a nav link on every page',
    },
    {
      key:   'hasContactLink',
      label: 'CONTACT PAGE LINK',
      fix:   'Add a /contact page with a nav link on every page',
    },
  ];

  grid.innerHTML = signals.map(({ key, label, fix }) => {
    const found = validPages.some(p => p.semantics?.eeat?.[key]);
    return `<div class="eeat-card ${found ? 'eeat-ok' : 'eeat-bad'}">
      <span class="eeat-icon">${found ? '✓' : '✗'}</span>
      <span class="eeat-label">${label}</span>
      ${!found ? `<span class="eeat-fix">${esc(fix)}</span>` : ''}
    </div>`;
  }).join('');
}

/* ─── Aggregate per-page issues ───────────────────────── */
function aggregatePageIssues(pages) {
  const counts = {};
  for (const page of pages) {
    for (const issue of page.semantics?.issues || []) {
      counts[issue] = (counts[issue] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

/* ─── Top Issues ──────────────────────────────────────── */
function renderTopIssues(aggregated, scoreIssues) {
  const list    = document.getElementById('issues-list');
  const noEl    = document.getElementById('no-issues');
  const countEl = document.getElementById('issues-count');

  const total = aggregated.length + scoreIssues.length;
  countEl.textContent = total ? `(${total})` : '';

  if (total === 0) {
    list.classList.add('hidden');
    noEl.classList.remove('hidden');
    return;
  }

  noEl.classList.add('hidden');
  list.classList.remove('hidden');
  list.innerHTML = [
    ...aggregated.map(([issue, count]) =>
      `<li><span class="issue-label">${esc(issue)}</span><span class="issue-pages">${count} PAGE${count !== 1 ? 'S' : ''}</span></li>`),
    ...scoreIssues.map(issue =>
      `<li><span class="issue-label">${esc(issue)}</span></li>`),
  ].join('');
}

/* ─── Recommendations ─────────────────────────────────── */
function renderRecommendations(robots, sitemap, llmsTxt, aggregated) {
  const list  = document.getElementById('recs-list');
  const noEl  = document.getElementById('no-recs');
  const count = document.getElementById('recs-count');

  const recs = buildRecommendations(robots, sitemap, llmsTxt, aggregated);
  count.textContent = recs.length ? `(${recs.length})` : '';

  if (recs.length === 0) {
    list.classList.add('hidden');
    noEl.classList.remove('hidden');
    return;
  }

  noEl.classList.add('hidden');
  list.classList.remove('hidden');
  list.innerHTML = recs.map(r => `<li>${esc(r)}</li>`).join('');
}

function buildRecommendations(robots, sitemap, llmsTxt, aggregated) {
  const recs = [];

  // llms.txt — highest-impact AI-specific fix, lead with it
  if (!llmsTxt.exists) {
    recs.push('Create /llms.txt — a structured guide for AI models. See llmstxt.org for the spec.');
  } else {
    if (!llmsTxt.hasTitle)
      recs.push('Add a title to llms.txt: start the file with "# Your Site Name" on line 1.');
    if (llmsTxt.sectionCount === 0)
      recs.push('Add content sections to llms.txt using "## Section Name" headings.');
    if (!llmsTxt.fullExists)
      recs.push('Consider adding /llms-full.txt with the complete text of your key pages.');
  }

  // robots.txt
  if (!robots.exists) {
    recs.push('Add a robots.txt file to explicitly grant AI crawlers access.');
  } else {
    const blocked = Object.entries(robots.aiBots).filter(([, v]) => v === 'blocked').map(([k]) => k);
    const partial = Object.entries(robots.aiBots).filter(([, v]) => v === 'partial').map(([k]) => k);
    if (blocked.length > 0)
      recs.push(`Unblock AI crawlers in robots.txt: ${blocked.join(', ')}`);
    if (partial.length > 0)
      recs.push(`Fix partial AI crawler blocks (path-specific Disallow rules): ${partial.join(', ')}`);
    const sitemaps = robots.sitemapDeclared;
    const hasSm = Array.isArray(sitemaps) ? sitemaps.length > 0 : !!sitemaps;
    if (!hasSm && sitemap.found)
      recs.push('Add a "Sitemap: <url>" directive to robots.txt.');
  }

  // sitemap
  if (!sitemap.found)
    recs.push('Create and submit a sitemap.xml to improve AI and search engine discoverability.');
  if (sitemap.found && !sitemap.hasLastmod)
    recs.push('Add <lastmod> dates to sitemap.xml — freshness signals matter for AI crawler prioritisation.');

  // per-page issues
  const issueRecs = {
    'Missing html lang attribute':       'Add lang="en" (or the correct BCP-47 code) to your <html> tag.',
    'Missing H1':                         'Add a single, descriptive H1 heading to each page.',
    'Multiple H1':                        'Each page should have exactly one H1 heading.',
    'Heading hierarchy skips levels':     'Fix heading structure — never skip from H1 to H3 without an H2.',
    'Missing meta description':           'Write a unique meta description (50–160 chars) for each page.',
    'Meta description too short':         'Expand your meta descriptions to at least 50 characters.',
    'Meta description too long':          'Trim your meta descriptions to under 160 characters.',
    'Missing canonical URL':              'Add <link rel="canonical"> to prevent duplicate-content dilution.',
    'Missing OG tags':                    'Add og:title and og:description for social and AI previews.',
    'No schema markup':                   'Add JSON-LD structured data (Article, FAQPage, Organization) to every page.',
    'Missing viewport':                   'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    'images missing alt text':            'Add descriptive alt text to all images.',
    'Low word count':                     'Expand page content to at least 300 words.',
    'Page may be noindex':                'Remove noindex unless you intentionally exclude this page from search.',
  };

  const seen = new Set();
  for (const [issue] of aggregated) {
    for (const [key, rec] of Object.entries(issueRecs)) {
      if (!seen.has(key) && issue.includes(key)) {
        recs.push(rec);
        seen.add(key);
        break;
      }
    }
  }

  return recs;
}

/* ─── Pages table ─────────────────────────────────────── */
function renderPages(pages) {
  document.getElementById('page-count').textContent = `(${pages.length})`;
  const tbody = document.getElementById('pages-tbody');

  tbody.innerHTML = pages.map((p, idx) => {
    if (p.error) {
      return `<tr class="row-main" onclick="toggleDetail(this,${idx})">
        <td title="${esc(p.url)}">${esc(trunc(p.url, 65))}</td>
        <td class="col-d">${p.depth}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
        <td>${renderTime(p.renderTime)}</td>
        <td><span class="tag err">${esc(String(p.error).slice(0, 18).toUpperCase())}</span></td>
      </tr>`;
    }

    const s    = p.semantics;
    const h1   = s.headings.h1.length;
    const dl   = s.meta.description?.length ?? 0;
    const can  = !!s.meta.canonical;
    const sch  = s.schemaTypes;
    const w    = s.content.wordCount;
    const img  = s.images;
    const lnk  = s.links;
    const iss  = s.issues.length;

    const h1cls  = h1 === 1 ? 'ok' : h1 === 0 ? 'bad' : 'warn';
    const dlcls  = dl >= 50 && dl <= 160 ? 'ok' : dl > 0 ? 'warn' : 'bad';
    const wcls   = w >= 300 ? 'ok' : 'warn';
    const isscls = iss === 0 ? 'ok' : iss <= 2 ? 'warn' : 'bad';

    const imgStr = img.missingAlt > 0
      ? `${img.total} <span class="tag bad">${img.missingAlt} NO ALT</span>`
      : `<span class="tag ok">${img.total}</span>`;

    const schStr = sch.length
      ? `<span class="schema-types" title="${esc(sch.join(', '))}">${esc(trunc(sch.join(', '), 24))}</span>`
      : `<span class="tag bad">NONE</span>`;

    const pageTitle = s.meta.title ? ` — ${trunc(s.meta.title, 50)}` : '';

    return `<tr class="row-main" onclick="toggleDetail(this,${idx})">
      <td title="${esc(p.url + pageTitle)}">${esc(trunc(p.url, 65))}</td>
      <td class="col-d">${p.depth}</td>
      <td><span class="tag ${h1cls}">${h1}</span></td>
      <td><span class="tag ${dlcls}">${dl ? dl + 'CH' : 'NONE'}</span></td>
      <td><span class="tag ${can ? 'ok' : 'bad'}">${can ? '✓' : '✗'}</span></td>
      <td>${schStr}</td>
      <td><span class="tag ${wcls}">${w}</span></td>
      <td>${imgStr}</td>
      <td><span style="font-size:0.72rem;font-weight:500;color:#555">${lnk.internal}↓ ${lnk.external}↗</span></td>
      <td>${renderTime(p.renderTime)}</td>
      <td><span class="tag ${isscls}">${iss}</span></td>
    </tr>`;
  }).join('');
}

function renderTime(ms) {
  if (!ms) return '<span style="color:#bbb;font-size:0.72rem">—</span>';
  const color = ms < 1000 ? 'var(--green)' : ms < 3000 ? 'var(--orange)' : 'var(--red)';
  const label = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  return `<span style="font-size:0.72rem;font-weight:700;color:${color}">${label}</span>`;
}

/* ─── Expandable detail row ───────────────────────────── */
function toggleDetail(trEl, idx) {
  const next = trEl.nextElementSibling;
  if (next && next.classList.contains('detail-row')) {
    next.remove();
    trEl.classList.remove('expanded');
    return;
  }
  trEl.classList.add('expanded');
  const detailTr = document.createElement('tr');
  detailTr.className = 'detail-row';
  const td = document.createElement('td');
  td.colSpan = 11;  // updated for TIME column
  td.innerHTML = buildDetailHTML(_pages[idx]);
  detailTr.appendChild(td);
  trEl.insertAdjacentElement('afterend', detailTr);
}

function buildDetailHTML(page) {
  if (page.error) {
    return `<div class="detail-error-msg">ERROR: ${esc(String(page.error))}</div>`;
  }
  const s = page.semantics;

  const metaRows = [
    ['Title',        s.meta.title          || '—'],
    ['Lang',         s.meta.lang           || '—'],
    ['Description',  s.meta.description    ? `${trunc(s.meta.description, 100)} (${s.meta.description.length}ch)` : '—'],
    ['Canonical',    s.meta.canonical      || '—'],
    ['OG Title',     s.meta.ogTitle        || '—'],
    ['OG Desc',      s.meta.ogDescription  ? trunc(s.meta.ogDescription, 80) : '—'],
    ['OG Image',     s.meta.ogImage        ? trunc(s.meta.ogImage, 60) : '—'],
    ['Robots Meta',  s.meta.robots         || '—'],
    ['Viewport',     s.meta.viewport       || '—'],
    ['Charset',      s.meta.charset        || '—'],
    ['Hreflang',     s.meta.hreflang?.length ? s.meta.hreflang.map(h => h.hreflang).join(', ') : '—'],
  ];

  const structRows = [
    ['H1',           s.headings.h1.length ? trunc(s.headings.h1[0], 60) : '—'],
    ['H2 Count',     s.headings.h2.length],
    ['H3 Count',     s.headings.h3.length],
    ['Hierarchy',    s.headings.hierarchy],
    ['Schema Types', s.schemaTypes.join(', ') || 'none'],
    ['Semantic Tags',Object.entries(s.semanticTags).filter(([,v]) => v > 0).map(([k,v]) => `${k}(${v})`).join(', ') || 'none'],
  ];

  const eeat = s.eeat || {};
  const freshness = s.freshness || {};

  const contentRows = [
    ['Word Count',    s.content.wordCount],
    ['Int. Links',    s.links.internal],
    ['Ext. Links',    s.links.external],
    ['Images Total',  s.images.total],
    ['Missing Alt',   s.images.missingAlt],
    ['Lazy Images',   s.images.lazyLoaded],
    ['Has FAQ',       s.content.hasFaq   ? 'YES' : 'no'],
    ['Has HowTo',     s.content.hasHowTo ? 'YES' : 'no'],
    ['Has Table',     s.content.hasTable ? 'YES' : 'no'],
    ['Render Time',   page.renderTime ? (page.renderTime < 1000 ? `${page.renderTime}ms` : `${(page.renderTime/1000).toFixed(1)}s`) : '—'],
    ['── E-E-A-T ──', ''],
    ['Author',        eeat.hasAuthor       ? 'YES' : 'no'],
    ['Organization',  eeat.hasOrganization ? 'YES' : 'no'],
    ['Publish Date',  freshness.publishDate || (eeat.hasPublishDate ? 'YES' : 'no')],
    ['Modified Date', freshness.modifiedDate || '—'],
    ['About Link',    eeat.hasAboutLink    ? 'YES' : 'no'],
    ['Contact Link',  eeat.hasContactLink  ? 'YES' : 'no'],
  ];

  const kvHtml = (rows) => rows.map(([k, v]) => {
    if (k.startsWith('──')) return `<div class="kv kv-divider"><span class="kv-k" style="color:#aaa;letter-spacing:0">${k}</span></div>`;
    const str = esc(String(v));
    const cls = (v === '—' || v === 'no' || v === 'none' || v === 'NO' || v === 0)
              ? 'val-bad'
              : (v === 'YES' || (typeof v === 'number' && v > 0))
              ? 'val-ok' : '';
    return `<div class="kv"><span class="kv-k">${k}</span><span class="kv-v ${cls}">${str}</span></div>`;
  }).join('');

  const issuesHtml = s.issues.length === 0
    ? '<span class="detail-no-issues">✓ NO ISSUES ON THIS PAGE</span>'
    : s.issues.map(i => `<span class="detail-issue">✕ ${esc(i)}</span>`).join('');

  return `<div class="detail-panel">
    <div class="detail-grid">
      <div>
        <div class="detail-section-title">META &amp; SEO</div>
        ${kvHtml(metaRows)}
      </div>
      <div>
        <div class="detail-section-title">STRUCTURE</div>
        ${kvHtml(structRows)}
      </div>
      <div>
        <div class="detail-section-title">CONTENT · E-E-A-T · PERFORMANCE</div>
        ${kvHtml(contentRows)}
      </div>
    </div>
    <div class="detail-issues-wrap">
      <div class="detail-section-title">ISSUES (${s.issues.length})</div>
      <div class="detail-issues-list">${issuesHtml}</div>
    </div>
  </div>`;
}

/* ─── Helpers ─────────────────────────────────────────── */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function trunc(str, n) {
  const s = String(str);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function propRow(key, val) {
  return `<div class="prop-row">
    <span class="prop-key">${key}</span>
    <span class="prop-val">${val}</span>
  </div>`;
}

function check(bool) {
  return bool
    ? '<span class="check yes">✓ YES</span>'
    : '<span class="check no">✗ NO</span>';
}
