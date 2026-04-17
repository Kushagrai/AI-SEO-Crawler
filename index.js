import { createRequire } from 'module';
import { crawl } from './crawler.js';
import { printReport, toJson } from './reporter.js';
import { writeFileSync } from 'fs';
import chalk from 'chalk';

const require = createRequire(import.meta.url);

function printCat() {
  const p  = chalk.hex('#FF69B4');  // hot pink   — body outline
  const lp = chalk.hex('#FFB6C1');  // light pink — fur fill
  const dp = chalk.hex('#FF1493');  // deep pink  — ears & dark accents
  const ie = chalk.hex('#FFD1DC');  // petal pink — inner ear
  const ey = chalk.hex('#87CEEB');  // sky blue   — iris ring
  const ep = chalk.hex('#1E3A5F');  // dark navy  — pupil
  const ns = chalk.hex('#FF8FA3');  // rose       — nose brackets
  const wh = chalk.hex('#FFF5EE');  // seashell   — muzzle box
  const mg = chalk.hex('#DA70D6');  // orchid     — subtitle
  const yw = chalk.hex('#FFFACD');  // pale gold  — whiskers

  console.log();
  console.log(`      ` + dp(`/\\`) + `            ` + dp(`/\\`));
  console.log(`     ` + dp(`/`) + ie(`  `) + dp(`\\`) + `          ` + dp(`/`) + ie(`  `) + dp(`\\`));
  console.log(`    ` + dp(`/`) + ie(`    `) + p(`\\`) + lp(`________`) + p(`/`) + ie(`    `) + dp(`\\`));
  console.log(`   ` + p(`╭`) + lp(`──────────────────────`) + p(`╮`));
  console.log(`   ` + p(`│`) + lp(`  `) + ey(`╭`) + ep(`◉`) + ey(`╮`) + lp(`            `) + ey(`╭`) + ep(`◉`) + ey(`╮`) + lp(`  `) + p(`│`));
  console.log(`   ` + p(`│`) + lp(`  `) + ey(`╰─╯`) + lp(`            `) + ey(`╰─╯`) + lp(`  `) + p(`│`));
  console.log(`   ` + p(`│`) + lp(`    `) + yw(`≈≈≈`) + lp(`        `) + yw(`≈≈≈`) + lp(`    `) + p(`│`));
  console.log(`   ` + p(`│`) + lp(`         `) + ns(`( `) + dp(`ᴥ`) + ns(` )`) + lp(`        `) + p(`│`));
  console.log(`   ` + p(`│`) + yw(`    ──`) + wh(`╭────────╮`) + yw(`──    `) + p(`│`));
  console.log(`   ` + p(`│`) + lp(`      `) + wh(`│`) + dp(`  >ω<   `) + wh(`│`) + lp(`      `) + p(`│`));
  console.log(`   ` + p(`│`) + yw(`    ──`) + wh(`╰────────╯`) + yw(`──    `) + p(`│`));
  console.log(`   ` + p(`╰`) + lp(`──────────────────────`) + p(`╯`));
  console.log(`          ` + p(`│`) + `           ` + p(`│`));
  console.log(`        ` + dp(`╱`) + p(`│`) + `           ` + p(`│`) + dp(`╲`));
  console.log(`       ` + dp(`(_)`) + `           ` + dp(`(_)`));
  console.log();
  console.log(`   ` + dp(`✦ `) + p(`AI SEO Crawler`) + dp(` ✦`));
  console.log(`   ` + mg(`sniffing your site for AI visibility...`));
  console.log();
}

// ── Argument parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const urlArg = args.find((a) => !a.startsWith('--'));

if (!urlArg) {
  console.error(
    'Usage: node index.js <url> [--depth=N] [--max-pages=N] [--concurrency=N] [--json] [--output=file.json]',
  );
  process.exit(1);
}

printCat();

let startUrl = urlArg;
if (!/^https?:\/\//i.test(startUrl)) startUrl = 'https://' + startUrl;

const jsonFlag   = args.includes('--json');
const depthArg   = args.find((a) => a.startsWith('--depth='));
const pagesArg   = args.find((a) => a.startsWith('--max-pages='));
const concArg    = args.find((a) => a.startsWith('--concurrency='));
const outputArg  = args.find((a) => a.startsWith('--output='));

const maxDepth   = depthArg   ? parseInt(depthArg.split('=')[1],   10) : 3;
const maxPages   = pagesArg   ? parseInt(pagesArg.split('=')[1],   10) : 100;
const concurrency = concArg   ? parseInt(concArg.split('=')[1],    10) : 3;
const outputFile = outputArg  ? outputArg.split('=').slice(1).join('=') : null;

// ── Run ──────────────────────────────────────────────────────────────────────

const { default: ora } = await import('ora');
const spinner = ora(`Crawling ${startUrl} (depth=${maxDepth}, pages≤${maxPages}, concurrency=${concurrency})...`).start();

const progressCb = (pageUrl, count) => {
  spinner.text = `Crawling... [${count + 1}] ${pageUrl.replace(/^https?:\/\/[^/]+/, '') || '/'}`;
};

function outputResults(data) {
  if (jsonFlag || outputFile) {
    const json = toJson(data);
    if (outputFile) {
      writeFileSync(outputFile, json, 'utf-8');
      console.log(`JSON written to ${outputFile}`);
    } else {
      console.log(json);
    }
  } else {
    printReport(data);
  }
}

const isConnErr = (msg = '') =>
  /ERR_SSL|ECONNREFUSED|ERR_CERT|net::ERR_|SSL_ERROR/i.test(msg);

let crawlData;
try {
  crawlData = await crawl(startUrl, maxDepth, maxPages, concurrency, progressCb);
} catch (err) {
  // Auto-retry with HTTP if HTTPS connection failed
  if (startUrl.startsWith('https://') && isConnErr(err.message)) {
    const httpUrl = startUrl.replace('https://', 'http://');
    spinner.text = `HTTPS failed — retrying with ${httpUrl}…`;
    try {
      crawlData = await crawl(httpUrl, maxDepth, maxPages, concurrency, progressCb);
    } catch (err2) {
      spinner.fail(`Crawl failed: ${err2.message}`);
      process.exit(1);
    }
  } else {
    spinner.fail(`Crawl failed: ${err.message}`);
    process.exit(1);
  }
}

spinner.succeed(`Crawl complete — ${crawlData.pages.length} page(s) analyzed`);
outputResults(crawlData);
