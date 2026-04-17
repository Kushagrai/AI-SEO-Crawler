import express from 'express';
import { crawl } from './crawler.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.redirect('/home.html'));

app.use(express.static(join(__dirname, 'public')));

// ── SSE crawl endpoint ────────────────────────────────────────────────────────
// GET /api/crawl?url=<url>&depth=<n>&maxPages=<n>&concurrency=<n>
//
// Event types:
//   progress    { url, count }
//   complete    { pages, robots, sitemap, llmsTxt, aiScore }
//   crawl_error { message }
// ─────────────────────────────────────────────────────────────────────────────
let activeCrawls = 0;
const MAX_CONCURRENT_CRAWLS = 5;

app.get('/api/crawl', async (req, res) => {
  const { url, depth = '3', maxPages = '50', concurrency = '3' } = req.query;

  if (!url) return res.status(400).json({ error: 'url query param is required' });

  if (activeCrawls >= MAX_CONCURRENT_CRAWLS) {
    return res.status(429).json({ error: 'Server busy — try again shortly' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Heartbeat — prevents proxy / browser timeouts on long crawls
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

  const controller = new AbortController();
  let closed = false;
  req.on('close', () => { closed = true; controller.abort(); });

  activeCrawls++;
  try {
    const startUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const result = await crawl(
      startUrl,
      Math.min(parseInt(depth, 10) || 3, 10),
      Math.min(parseInt(maxPages, 10) || 50, 200),
      Math.min(parseInt(concurrency, 10) || 3, 8),
      (pageUrl, count) => { if (!closed) send('progress', { url: pageUrl, count }); },
      controller.signal,
    );
    if (!closed) send('complete', result);
  } catch (err) {
    if (!closed) send('crawl_error', { message: err.message || 'Unknown error' });
  } finally {
    activeCrawls--;
    clearInterval(heartbeat);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n  AI SEO Crawler UI →  http://localhost:${PORT}\n`);
});
