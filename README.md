# AI-SEO-Crawler

A website auditing tool that measures how visible your site is to AI-powered search engines and large language models (LLMs). Get a 0–100 score across six weighted dimensions with actionable recommendations.

## What It Does

AI crawlers like GPTBot, ClaudeBot, and PerplexityBot have different requirements than traditional search engines. This tool checks whether your site is properly configured for them — analyzing robots.txt permissions, llms.txt guidance, sitemap structure, semantic HTML quality, Schema.org markup, and E-E-A-T trust signals.

Available as both a **CLI tool** and a **web UI** with real-time progress.

---

## Scoring System

| Category | Weight | What It Checks |
|---|---|---|
| Semantics | 25 pts | H1-H4 structure, meta tags, canonical, word count, alt text |
| Schema.org | 20 pts | JSON-LD types (Organization, Article, FAQPage, HowTo, etc.) |
| robots.txt | 15 pts | AI bot access (15 bots tracked), sitemap declaration |
| sitemap.xml | 15 pts | Discoverability, URL count, freshness (lastmod) |
| E-E-A-T | 15 pts | Author, organization, dates, About/Contact pages |
| llms.txt | 10 pts | LLM content guidance file (emerging standard) |

**Grades:** A (88+) · B (72+) · C (55+) · D (38+) · F (<38)

---

## AI Bots Tracked

GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, Bingbot, CCBot, Applebot-Extended, meta-externalagent, AI2Bot, Bytespider, cohere-ai, YouBot

---

## Installation

```bash
npm install
npx playwright install chromium
```

> Playwright Chromium is required for browser-based rendering of JavaScript sites. Only needed once.

---

## Usage

### CLI

```bash
npm start <url> [options]
```

**Options:**

| Flag | Default | Description |
|---|---|---|
| `--depth=N` | 3 | Crawl depth (BFS hops) |
| `--max-pages=N` | 100 | Max pages to crawl |
| `--concurrency=N` | 3 | Parallel browser pages |
| `--json` | — | Output JSON instead of table |
| `--output=file.json` | — | Save results to file |

**Examples:**

```bash
# Basic audit
npm start example.com

# Shallow audit (faster)
npm start example.com --depth=1 --max-pages=20

# Large site
npm start example.com --depth=3 --max-pages=200 --concurrency=5

# Save as JSON
npm start example.com --output=report.json
```

### Web UI

```bash
npm run serve
```

Opens at `http://localhost:3000` — enter a URL, set crawl options, and watch results stream in real time.

Set a custom port with the `PORT` environment variable:

```bash
PORT=8080 npm run serve
```

---

## How It Works

1. **Pre-fetches** robots.txt, sitemap.xml, and llms.txt in parallel
2. **Launches** a headless Chromium browser (blocks images, fonts, CSS for speed)
3. **Crawls** pages breadth-first with a configurable worker pool
4. **Analyzes** each page for semantic quality, schema markup, and E-E-A-T signals
5. **Scores** everything and returns prioritized recommendations

The web UI streams progress via Server-Sent Events (SSE). The CLI shows a live spinner with page counts.

---

## Project Structure

```
ai-seo-crawler/
├── index.js              # CLI entry point
├── server.js             # Express web server + SSE API
├── crawler.js            # Core crawl engine (Playwright)
├── reporter.js           # CLI report formatter + JSON export
├── analyzers/
│   ├── aiSeo.js          # Scoring engine (100-point system)
│   ├── semantics.js      # Per-page HTML analysis
│   ├── robots.js         # robots.txt parser + AI bot checker
│   ├── sitemap.js        # sitemap.xml validator
│   └── llmsTxt.js        # /llms.txt validator
└── public/
    ├── home.html         # Main web UI
    ├── about.html        # Documentation page
    ├── app.js            # Frontend logic (vanilla JS)
    ├── cat.js            # Animated mascot
    └── style.css         # Design system
```

---

## Tech Stack

- **Runtime:** Node.js (ES modules)
- **Browser automation:** [Playwright](https://playwright.dev/) (Chromium)
- **HTML parsing:** [Cheerio](https://cheerio.js.org/)
- **Web server:** [Express](https://expressjs.com/)
- **HTTP client:** [Axios](https://axios-http.com/)
- **CLI output:** Chalk, Ora, cli-table3
- **Frontend:** Vanilla JS, GSAP, Lenis, Space Grotesk

---

## Web API

The server exposes a single SSE endpoint:

```
GET /api/crawl?url=<url>&depth=<n>&maxPages=<n>&concurrency=<n>
```

**Events:**

```js
// Fired on each page crawled
event: progress
data: { "url": "https://example.com/page", "count": 5 }

// Fired once with full results
event: complete
data: { "pages": [...], "robots": {...}, "sitemap": {...}, "llmsTxt": {...}, "aiScore": {...} }

// Fired on error
event: crawl_error
data: { "message": "Connection timeout" }
```

Max 5 concurrent crawls. Returns `429` if the limit is exceeded.

---

## License

MIT
