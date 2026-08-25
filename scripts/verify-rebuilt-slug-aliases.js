#!/usr/bin/env node

/** Verify the approved rebuilt-slug URL Alias slice and deterministic projections. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  URL_ALIAS_CONTRACT,
  buildUrlAliasProjection,
  getUrlAliasAuthorityDigest,
  getUrlAliasAuthoritySummary,
  getUrlAliasSlice,
  readUrlAliasAuthority
} = require('./lib/url-alias-authority');
const { writeCloudflareWorker, writeNginxRedirectMap } = require('./lib/redirects');

const ROOT = path.resolve(__dirname, '..');
const SLICE = 'rebuilt-slug';

function readRebuiltSlugSlice() {
  const authority = readUrlAliasAuthority(ROOT);
  const slice = getUrlAliasSlice(authority, SLICE, {
    rootDir: ROOT,
    requireEvidence: true
  });
  const summary = getUrlAliasAuthoritySummary(slice);
  const expected = URL_ALIAS_CONTRACT.slices[SLICE];
  assert.equal(summary.sources, expected.sources, 'Unexpected rebuilt-slug source count');
  assert.deepEqual(summary.sourceHosts, expected.sourceHosts, 'Unexpected rebuilt-slug host partition');
  assert.equal(slice.records.length, slice.bySource.size, 'Rebuilt-slug source-to-many mapping detected');
  assert.deepEqual(summary.reasons, { 'cross-host': 14, 'slug-rebuild': 531 });
  assert.deepEqual(summary.targetHosts, { 'fastgpt.io': 545 });

  for (const record of slice.records) {
    if (record.sourceHost === 'fastgpt.io') {
      assert.equal(record.reason, 'slug-rebuild');
      assert.equal(record.targetHost, 'fastgpt.io');
    } else {
      assert.equal(record.reason, 'cross-host');
      assert.equal(record.targetHost, 'fastgpt.io');
    }
  }
  return { authority, slice };
}

function projectionBytes(authorityResult, tempDir) {
  const baseUrls = { 'fastgpt.cn': 'https://fastgpt.cn', 'fastgpt.io': 'https://fastgpt.io' };
  const metadata = {
    authorityDigest: getUrlAliasAuthorityDigest(authorityResult),
    authoritySourceCount: authorityResult.records.length,
    slice: SLICE
  };
  const output = {};
  for (const [host, variant] of [
    ['fastgpt.cn', 'cn'],
    ['fastgpt.io', 'io']
  ]) {
    const projection = buildUrlAliasProjection(authorityResult, host, baseUrls);
    const variantDir = path.join(tempDir, variant);
    const nginxDir = path.join(variantDir, 'nginx');
    const workerDir = path.join(variantDir, 'worker');
    writeNginxRedirectMap(nginxDir, projection, metadata);
    writeCloudflareWorker(workerDir, projection, false, metadata);
    output[variant] = {
      projection: JSON.stringify([...projection]),
      nginx: fs.readFileSync(path.join(nginxDir, 'nginx-redirects.conf'), 'utf8'),
      worker: fs.readFileSync(path.join(workerDir, '_worker.js'), 'utf8')
    };
  }
  return output;
}

function verifyProjections(authority, slice) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-rebuilt-slug-'));
  try {
    const first = projectionBytes(slice, tempDir);
    const second = projectionBytes(slice, tempDir);
    assert.deepEqual(first, second, 'Rebuilt-slug projections are not deterministic');

    for (const [host, expected] of Object.entries(URL_ALIAS_CONTRACT.slices[SLICE].sourceHosts)) {
      const projection = buildUrlAliasProjection(slice, host);
      assert.equal(projection.size, expected, `Unexpected ${host} rebuilt-slug projection size`);
      const fullProjection = buildUrlAliasProjection(authority, host);
      for (const [sourcePath, target] of projection) {
        assert.equal(fullProjection.get(sourcePath), target, `Rebuilt-slug projection drift: ${sourcePath}`);
        const variant = host === 'fastgpt.cn' ? 'cn' : 'io';
        assert(first[variant].nginx.includes(`"${target}"`), `Nginx projection misses ${sourcePath}`);
        assert(
          first[variant].worker.includes(JSON.stringify([sourcePath, target])),
          `Worker projection misses ${sourcePath}`
        );
      }
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  const { authority, slice } = readRebuiltSlugSlice();
  verifyProjections(authority, slice);
  console.log(
    `[verify-rebuilt-slug-aliases] source passed (aliases=${slice.records.length}, ` +
      `io=${URL_ALIAS_CONTRACT.slices[SLICE].sourceHosts['fastgpt.io']}, ` +
      `cn=${URL_ALIAS_CONTRACT.slices[SLICE].sourceHosts['fastgpt.cn']}, ` +
      `sliceDigest=${getUrlAliasAuthorityDigest(slice)}, ` +
      `authorityDigest=${getUrlAliasAuthorityDigest(authority)})`
  );
}

try {
  main();
} catch (error) {
  console.error(`[verify-rebuilt-slug-aliases] ${error.message}`);
  process.exitCode = 1;
}

module.exports = { readRebuiltSlugSlice, verifyProjections };
