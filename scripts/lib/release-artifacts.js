const fs = require('node:fs');
const path = require('node:path');
const { URL_ALIAS_CONTRACT } = require('./url-alias-authority');
const { writeUrlAliasArtifactBundle } = require('./url-alias-artifacts');
const { directoryInventory } = require('./release-readiness');
const { EXPECTED_FAQ_COUNTS } = require('./release-record');
const { GENERATED_PUBLIC_PATHS } = require('./release-cross-project');

const ROOT = path.resolve(__dirname, '../..');
const NEXT_DIR = path.join(ROOT, '.next');
const OUT_DIR = path.join(ROOT, 'out');
const RETAIN_DIR = path.join(ROOT, '.release-artifacts');

function clearBuildArtifacts() {
  fs.rmSync(NEXT_DIR, { recursive: true, force: true });
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
}

function snapshotGeneratedPublicFiles() {
  return new Map(
    GENERATED_PUBLIC_PATHS.map((relativePath) => {
      const filePath = path.join(ROOT, relativePath);
      return [relativePath, fs.existsSync(filePath) ? fs.readFileSync(filePath) : null];
    })
  );
}

function restoreGeneratedPublicFiles(snapshot) {
  for (const [relativePath, contents] of snapshot) {
    const filePath = path.join(ROOT, relativePath);
    if (contents === null) {
      fs.rmSync(filePath, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
}

function findCaseFoldCollisionPair() {
  const registry = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src/faq/generated-en-route-registry.json'), 'utf8')
  );
  const byFoldedSlug = new Map();
  for (const record of registry.records) {
    const folded = record.canonicalSlug.toLocaleLowerCase('en-US');
    const candidates = byFoldedSlug.get(folded) || [];
    candidates.push(record.canonicalSlug);
    byFoldedSlug.set(folded, candidates);
  }
  for (const candidates of byFoldedSlug.values()) {
    if (new Set(candidates).size > 1) return candidates.slice(0, 2);
  }
  return ['How-AI-helps-in-planning', 'How-AI-Helps-in-Planning'];
}

function assertCaseSensitiveFilesystem() {
  const probeDir = fs.mkdtempSync(path.join(ROOT, '.release-case-probe-'));
  const upperPath = path.join(probeDir, 'CaseProbe');
  const lowerPath = path.join(probeDir, 'caseprobe');
  try {
    fs.writeFileSync(upperPath, 'case-sensitive probe');
    const caseSensitive = !fs.existsSync(lowerPath);
    if (!caseSensitive) {
      const [first, second] = findCaseFoldCollisionPair();
      throw new Error(
        `case-insensitive filesystem detected for published FAQ routes ${first} and ${second}; run the Guide Release Verification workflow, docker build --file Dockerfile.verify --tag fastgpt-guide-release-verify ., or use a case-sensitive APFS workspace (source-only remains available)`
      );
    }
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

function variantEnvironment(variant) {
  const baseUrl = variant === 'cn' ? 'https://fastgpt.cn' : 'https://fastgpt.io';
  return {
    ...process.env,
    CI: process.env.CI || '1',
    NODE_ENV: 'production',
    NEXT_PUBLIC_SITE_VARIANT: variant,
    NEXT_PUBLIC_HOME_URL: baseUrl,
    NEXT_PUBLIC_CN_HOME_URL: 'https://fastgpt.cn',
    NEXT_PUBLIC_IO_HOME_URL: 'https://fastgpt.io',
    NEXT_PUBLIC_LANGUAGE_REGION: variant === 'cn' ? 'zh-CN' : 'en-US'
  };
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

function faqRouteKey(filePath) {
  const relativePath = path.relative(OUT_DIR, filePath).replaceAll(path.sep, '/');
  if (!relativePath.startsWith('faq/')) return undefined;
  const route = relativePath.slice('faq/'.length);
  if (route.endsWith('/index.html')) return route.slice(0, -'/index.html'.length);
  if (route.endsWith('.html')) return route.slice(0, -'.html'.length);
  return undefined;
}

function verifyExportCardinality(variant) {
  const expected = EXPECTED_FAQ_COUNTS[variant];
  const routeKeys = new Set(
    walkFiles(path.join(OUT_DIR, 'faq'))
      .filter((filePath) => filePath.endsWith('.html'))
      .map(faqRouteKey)
      .filter(Boolean)
  );
  if (routeKeys.size !== expected) {
    throw new Error(
      `variant=${variant} FAQ HTML route cardinality mismatch: expected ${expected}, found ${routeKeys.size}`
    );
  }

  if (variant !== 'preview') {
    const sitemapPath = path.join(OUT_DIR, 'sitemap.xml');
    if (!fs.existsSync(sitemapPath))
      throw new Error(`variant=${variant} is missing out/sitemap.xml`);
    const sitemapUrls = [
      ...fs.readFileSync(sitemapPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)
    ].map((match) => match[1]);
    const faqUrls = sitemapUrls.filter((url) => {
      try {
        const parsed = new URL(url);
        return (
          parsed.pathname.startsWith('/faq/') &&
          parsed.pathname.split('/').filter(Boolean).length === 2
        );
      } catch {
        return false;
      }
    });
    if (faqUrls.length !== expected || new Set(faqUrls).size !== expected) {
      throw new Error(
        `variant=${variant} FAQ sitemap cardinality mismatch: expected ${expected}, found ${faqUrls.length}`
      );
    }
  }
}

function recordVariantArtifactInventory(record, variant) {
  const capturedAt = new Date().toISOString();
  const inventory = directoryInventory(OUT_DIR, {
    root: ROOT,
    role: 'static-export',
    source: 'generated',
    capturedAt
  });
  record.artifacts.push({ variant, ...inventory });
}

function recordVariantRollbackInventory(record, variant) {
  const bundlePath = path.join(RETAIN_DIR, 'url-alias', variant);
  if (!fs.existsSync(bundlePath)) return;
  record.rollback.inventory.push(
    directoryInventory(bundlePath, {
      root: ROOT,
      role: 'url-alias-rollback-bundle',
      source: 'generated'
    })
  );
}

function recordVariantExportRollbackInventory(record, variant) {
  if (!fs.existsSync(OUT_DIR)) return;
  const inventory = directoryInventory(OUT_DIR, {
    root: ROOT,
    role: 'static-export-rollback',
    source: 'generated'
  });
  const summary = { ...inventory };
  delete summary.files;
  record.rollback.inventory.push({ variant, ...summary });
}

function retainFailureArtifacts(variant) {
  const retainedPath = path.join(RETAIN_DIR, variant);
  fs.rmSync(retainedPath, { recursive: true, force: true });
  fs.mkdirSync(RETAIN_DIR, { recursive: true });
  fs.mkdirSync(retainedPath, { recursive: true });
  if (fs.existsSync(NEXT_DIR))
    fs.cpSync(NEXT_DIR, path.join(retainedPath, '.next'), { recursive: true });
  if (fs.existsSync(OUT_DIR))
    fs.cpSync(OUT_DIR, path.join(retainedPath, 'out'), { recursive: true });
  return retainedPath;
}

function retainSuccessArtifacts(variant, retainDir) {
  const retainedPath = path.join(retainDir, variant);
  fs.rmSync(retainedPath, { recursive: true, force: true });
  fs.mkdirSync(retainedPath, { recursive: true });
  const retainedOut = path.join(retainedPath, 'out');
  const redirectMap = path.join(NEXT_DIR, 'nginx-redirects.conf');
  if (!fs.existsSync(redirectMap)) {
    throw new Error(`Missing generated redirect map: ${redirectMap}`);
  }
  fs.cpSync(OUT_DIR, retainedOut, { recursive: true });
  fs.mkdirSync(path.join(retainedOut, '__release'), { recursive: true });
  fs.copyFileSync(redirectMap, path.join(retainedOut, '__release', 'nginx-redirects.conf'));
  const aliasBundle = writeUrlAliasArtifactBundle(ROOT, retainedPath, variant);
  if (aliasBundle.releaseManifest.authority.sourceCount !== URL_ALIAS_CONTRACT.sources) {
    throw new Error(`URL Alias artifact source count drift for ${variant}`);
  }
  return retainedPath;
}

module.exports = {
  assertCaseSensitiveFilesystem,
  clearBuildArtifacts,
  recordVariantArtifactInventory,
  recordVariantExportRollbackInventory,
  recordVariantRollbackInventory,
  restoreGeneratedPublicFiles,
  retainFailureArtifacts,
  retainSuccessArtifacts,
  snapshotGeneratedPublicFiles,
  variantEnvironment,
  verifyExportCardinality
};
