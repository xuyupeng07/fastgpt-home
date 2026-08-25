#!/usr/bin/env node

/** Verify the bounded Technical Center listing and its initial JavaScript budget. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { resolveSiteVariant } = require('./lib/site-variant');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
const BUDGET = require('./fixtures/technical-center-budget.json');

function resolveHtml(outDir, route) {
  const candidates = getStaticRouteCandidates(outDir, route);
  const htmlPath = candidates.find((candidate) => fs.existsSync(candidate));
  assert(htmlPath, `Missing static Technical Center HTML for ${route}`);
  return htmlPath;
}

function getStaticRouteCandidates(outDir, route) {
  const relativeRoute = route.replace(/^\/+|\/+$/g, '');
  return [
    path.join(outDir, `${relativeRoute}.html`),
    path.join(outDir, relativeRoute, 'index.html')
  ];
}

function getInitialJavaScriptGzipBytes(html, outDir) {
  const scriptSources = getInitialJavaScriptSources(html);
  let gzipBytes = 0;

  for (const source of scriptSources) {
    const scriptPath = path.join(outDir, source.replace(/^\//, ''));
    assert(fs.existsSync(scriptPath), `Missing initial JavaScript asset ${source}`);
    gzipBytes += zlib.gzipSync(fs.readFileSync(scriptPath), { level: 9 }).length;
  }

  assert(scriptSources.size > 0, 'Technical Center HTML has no initial JavaScript assets');
  return gzipBytes;
}

function getInitialJavaScriptSources(html) {
  return new Set(
    [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((source) => source?.startsWith('/_next/') && source.endsWith('.js'))
  );
}

function verifyRegistryIsOutsideInitialJavaScript(html, outDir, registryPath, maxInitialEntries) {
  const scriptSources = getInitialJavaScriptSources(html);
  const initialJavaScript = [...scriptSources]
    .map((source) => fs.readFileSync(path.join(outDir, source.replace(/^\//, '')), 'utf8'))
    .join('\n');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const embeddedEntry = registry.slice(maxInitialEntries).find((entry) => {
    return typeof entry.slug === 'string' && initialJavaScript.includes(entry.slug);
  });
  assert(
    !embeddedEntry,
    `Technical registry entry ${embeddedEntry?.slug} is embedded in initial JavaScript`
  );
}

function verifySearchProjection(searchIndexPath, registryPath) {
  assert(
    fs.existsSync(searchIndexPath),
    `Missing Technical Center search projection ${searchIndexPath}`
  );
  const projection = JSON.parse(fs.readFileSync(searchIndexPath, 'utf8'));
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  assert(Array.isArray(projection), 'Technical Center search projection must be an array');
  assert.equal(
    projection.length,
    registry.length,
    `Technical Center search projection has ${projection.length} entries; expected ${registry.length}`
  );
  return projection.length;
}

function countInitialEntries(html) {
  return (html.match(/<article(?:\s|>)/g) || []).length;
}

function getServerListingLinks(html, outDir) {
  const articles = [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map((match) => match[0]);
  return articles.map((article, index) => {
    const href = article.match(/<a\b[^>]*href="(\/[^"#?]+)"/i)?.[1];
    assert(href, `Technical Center server entry ${index + 1} has no public link`);
    assert(
      !href.startsWith('//'),
      `Technical Center server entry ${index + 1} has an invalid link`
    );
    const relativePath = href.replace(/^\/+/, '').replace(/\/$/, '');
    const candidates = getStaticRouteCandidates(outDir, `/${relativePath}`);
    assert(
      candidates.some((candidate) => fs.existsSync(candidate)),
      `Technical Center server entry ${index + 1} links to missing route ${href}`
    );
    return href;
  });
}

function verifyTechnicalCenter({
  outDir = OUT_DIR,
  route = BUDGET.route,
  maxInitialEntries = BUDGET.maxInitialEntries,
  baselineGzipBytes = BUDGET.baselineGzipBytes,
  maxIncreaseBytes = BUDGET.maxIncreaseBytes,
  registryPath = path.join(ROOT, 'src/components/tech-center/entries.json'),
  searchIndexPath
} = {}) {
  const htmlPath = resolveHtml(outDir, route);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const searchEntries = verifySearchProjection(
    searchIndexPath || path.join(outDir, 'tech-center/search-index.json'),
    registryPath
  );
  const initialEntries = countInitialEntries(html);
  assert(initialEntries > 0, 'Technical Center HTML has no server-rendered entries');
  assert(
    initialEntries <= maxInitialEntries,
    [
      `Technical Center initial listing has ${initialEntries} entries; `,
      `maximum is ${maxInitialEntries}`
    ].join('')
  );
  const serverListingLinks = getServerListingLinks(html, outDir);

  const gzipBytes = getInitialJavaScriptGzipBytes(html, outDir);
  verifyRegistryIsOutsideInitialJavaScript(html, outDir, registryPath, maxInitialEntries);
  const maxGzipBytes = baselineGzipBytes + maxIncreaseBytes;
  assert(
    gzipBytes <= maxGzipBytes,
    [
      `Technical Center initial JavaScript is ${(gzipBytes / 1024).toFixed(1)} KiB gzip; `,
      `maximum is ${(maxGzipBytes / 1024).toFixed(1)} KiB`
    ].join('')
  );

  return {
    gzipBytes,
    htmlPath,
    initialEntries,
    maxGzipBytes,
    route,
    searchEntries,
    serverListingLinks
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--out-dir') {
      const outDir = argv[++index];
      if (!outDir || outDir.startsWith('--')) {
        throw new Error('--out-dir requires a directory');
      }
      options.outDir = path.resolve(ROOT, outDir);
    } else if (token === '--route') {
      options.route = argv[++index];
      if (!options.route || options.route.startsWith('--')) {
        throw new Error('--route requires a route');
      }
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const variant = resolveSiteVariant();
  if (variant === 'io') {
    console.log(`[verify-technical-center] skipped for variant=${variant}`);
    return;
  }

  const options = parseArgs(argv);
  const route = options.route || (variant === 'preview' ? '/zh/tech-center' : BUDGET.route);
  const result = verifyTechnicalCenter({ ...options, route });
  console.log(
    [
      `[verify-technical-center] passed: ${result.route}, `,
      `${result.initialEntries} server entries, `,
      `${result.searchEntries} search entries, `,
      `${(result.gzipBytes / 1024).toFixed(1)} KiB initial JavaScript gzip`
    ].join('')
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  countInitialEntries,
  getInitialJavaScriptGzipBytes,
  getStaticRouteCandidates,
  getServerListingLinks,
  main,
  verifyTechnicalCenter,
  verifyRegistryIsOutsideInitialJavaScript,
  verifySearchProjection
};
