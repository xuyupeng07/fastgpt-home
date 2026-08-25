#!/usr/bin/env node

/** Verify the approved case-only URL Alias slice and its deterministic projections. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildUrlAliasProjection,
  getUrlAliasAuthorityDigest,
  getUrlAliasAuthoritySummary,
  getUrlAliasSlice,
  readUrlAliasAuthority
} = require('./lib/url-alias-authority');
const { writeCloudflareWorker, writeNginxRedirectMap } = require('./lib/redirects');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED_COUNTS = { 'fastgpt.cn': 23, 'fastgpt.io': 720 };
const EXPECTED_TOTAL = Object.values(EXPECTED_COUNTS).reduce(
  (total, count) => total + count,
  0
);
const CASE_ONLY_REASON = 'case-only';

function readCaseOnlySlice() {
  const authority = readUrlAliasAuthority(ROOT);
  const slice = getUrlAliasSlice(authority, CASE_ONLY_REASON, {
    rootDir: ROOT,
    requireEvidence: true
  });
  const summary = getUrlAliasAuthoritySummary(slice);
  assert.equal(summary.sources, EXPECTED_TOTAL, 'Unexpected case-only source count');
  assert.deepEqual(summary.sourceHosts, EXPECTED_COUNTS, 'Unexpected case-only host partition');
  assert.equal(summary.targets, 742, 'Unexpected case-only terminal target count');
  assert.equal(summary.manyToOneTargets, 1, 'Unexpected case-only many-to-one target count');
  assert.equal(
    slice.records.filter((record) => record.reason !== CASE_ONLY_REASON).length,
    0,
    'Rebuilt-slug or cross-host records entered the case-only slice'
  );
  assert.equal(
    slice.records.length,
    slice.bySource.size,
    'Case-only source-to-many mapping detected'
  );
  return { authority, slice };
}

function assertCaseOnlyPath(record) {
  assert.equal(
    record.sourceHost,
    record.targetHost,
    `Case-only mapping crossed hosts: ${record.sourcePath}`
  );
  const normalizedSource = record.sourcePath.startsWith('/en/faq/')
    ? record.sourcePath.slice('/en'.length)
    : record.sourcePath;
  assert.notEqual(
    record.sourcePath,
    record.targetPath,
    `Case-only mapping self-targets: ${record.sourcePath}`
  );
  assert.equal(
    normalizedSource.toLowerCase(),
    record.targetPath.toLowerCase(),
    `Case-only mapping changed the route identity: ${record.sourcePath} -> ${record.targetPath}`
  );
}

function projectionBytes(authority, tempDir) {
  const baseUrls = { 'fastgpt.cn': 'https://fastgpt.cn', 'fastgpt.io': 'https://fastgpt.io' };
  const metadata = {
    authorityDigest: getUrlAliasAuthorityDigest(authority),
    authoritySourceCount: authority.records.length,
    slice: CASE_ONLY_REASON
  };
  const projections = {
    cn: buildUrlAliasProjection(authority, 'fastgpt.cn', baseUrls),
    io: buildUrlAliasProjection(authority, 'fastgpt.io', baseUrls)
  };
  const output = {};
  for (const [variant, projection] of Object.entries(projections)) {
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
  for (const record of slice.records) assertCaseOnlyPath(record);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-case-only-'));
  try {
    const first = projectionBytes(slice, tempDir);
    const second = projectionBytes(slice, tempDir);
    assert.deepEqual(first, second, 'Case-only projections are not deterministic');
    for (const [host, expected] of Object.entries(EXPECTED_COUNTS)) {
      const variant = host === 'fastgpt.cn' ? 'cn' : 'io';
      const projection = buildUrlAliasProjection(slice, host);
      assert.equal(projection.size, expected, `Unexpected ${host} case-only projection size`);
      const fullProjection = buildUrlAliasProjection(authority, host);
      for (const [sourcePath, target] of projection) {
        assert.equal(
          fullProjection.get(sourcePath),
          target,
          `Case-only projection drift: ${sourcePath}`
        );
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
  const { authority, slice } = readCaseOnlySlice();
  verifyProjections(authority, slice);
  const digest = getUrlAliasAuthorityDigest(slice);
  console.log(
    `[verify-case-only-aliases] source passed (aliases=${slice.records.length}, ` +
      `io=${EXPECTED_COUNTS['fastgpt.io']}, cn=${EXPECTED_COUNTS['fastgpt.cn']}, ` +
      `sliceDigest=${digest}, authorityDigest=${getUrlAliasAuthorityDigest(authority)})`
  );
}

try {
  main();
} catch (error) {
  console.error(`[verify-case-only-aliases] ${error.message}`);
  process.exitCode = 1;
}

module.exports = { EXPECTED_COUNTS, EXPECTED_TOTAL, readCaseOnlySlice, verifyProjections };
