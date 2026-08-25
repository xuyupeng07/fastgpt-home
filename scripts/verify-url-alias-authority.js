#!/usr/bin/env node

/** Verify the committed host-aware URL Alias Authority and deterministic edge projections. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  URL_ALIAS_CONTRACT,
  buildUrlAliasProjection,
  getUrlAliasAuthoritySummary,
  readUrlAliasAuthority,
  validateUrlAliasAuthority
} = require('./lib/url-alias-authority');
const { writeCloudflareWorker, writeNginxRedirectMap } = require('./lib/redirects');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED_SOURCE_COUNTS = URL_ALIAS_CONTRACT.sourceHosts;

function minimalRecord(sourcePath, targetPath, sourceHost = 'fastgpt.io', targetHost = sourceHost) {
  return { sourceHost, sourcePath, targetHost, targetPath };
}

function assertValidationFixtures() {
  assert.throws(
    () =>
      validateUrlAliasAuthority([
        minimalRecord('/faq/old', '/faq/one'),
        minimalRecord('/faq/old', '/faq/two')
      ]),
    /source-to-many mapping/
  );
  assert.throws(
    () =>
      validateUrlAliasAuthority([
        minimalRecord('/faq/old', '/faq/middle'),
        minimalRecord('/faq/middle', '/faq/new')
      ]),
    /redirect chain/
  );
  assert.throws(
    () =>
      validateUrlAliasAuthority([
        minimalRecord('/faq/old', '/faq/middle'),
        minimalRecord('/faq/middle', '/faq/old')
      ]),
    /redirect cycle/
  );
  assert.throws(
    () => validateUrlAliasAuthority([minimalRecord('/faq/old', '/faq/new', 'example.com')]),
    /sourceHost/
  );
  assert.throws(
    () => validateUrlAliasAuthority([minimalRecord('faq/old', '/faq/new')]),
    /sourcePath/
  );
  assert.throws(
    () => validateUrlAliasAuthority([minimalRecord('/faq/old?x=1', '/faq/new')]),
    /query strings/
  );
  const manyToOne = validateUrlAliasAuthority([
    minimalRecord('/faq/old-one', '/faq/new'),
    minimalRecord('/faq/old-two', '/faq/new')
  ]);
  assert.equal(manyToOne.records.length, 2);
}

function projectionBytes(authority, sourceHost, baseUrls, tempDir) {
  const projection = buildUrlAliasProjection(authority, sourceHost, baseUrls);
  const nginxDir = path.join(tempDir, `${sourceHost}-nginx`);
  const workerDir = path.join(tempDir, `${sourceHost}-worker`);
  fs.mkdirSync(workerDir, { recursive: true });
  writeNginxRedirectMap(nginxDir, projection, {
    authorityDigest: getUrlAliasAuthoritySummary(authority).digest,
    authoritySourceCount: authority.records.length
  });
  writeCloudflareWorker(workerDir, projection, false, {
    authorityDigest: getUrlAliasAuthoritySummary(authority).digest,
    authoritySourceCount: authority.records.length
  });
  return {
    projection: JSON.stringify([...projection]),
    nginx: fs.readFileSync(path.join(nginxDir, 'nginx-redirects.conf'), 'utf8'),
    worker: fs.readFileSync(path.join(workerDir, '_worker.js'), 'utf8')
  };
}

function main() {
  assertValidationFixtures();
  const authority = readUrlAliasAuthority(ROOT);
  const summary = getUrlAliasAuthoritySummary(authority);
  assert.equal(authority.authority.recordCount, authority.records.length);
  assert.equal(summary.sources, 1288);
  assert.deepEqual(summary.sourceHosts, EXPECTED_SOURCE_COUNTS);
  assert.equal(summary.targets, URL_ALIAS_CONTRACT.targets);
  assert.equal(summary.manyToOneTargets, URL_ALIAS_CONTRACT.manyToOneTargets);
  assert.deepEqual(summary.reasons, { 'case-only': 743, 'cross-host': 14, 'slug-rebuild': 531 });

  const baseUrls = { 'fastgpt.cn': 'https://fastgpt.cn', 'fastgpt.io': 'https://fastgpt.io' };
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-url-alias-'));
  try {
    for (const sourceHost of Object.keys(EXPECTED_SOURCE_COUNTS)) {
      const first = projectionBytes(authority, sourceHost, baseUrls, tempDir);
      const second = projectionBytes(authority, sourceHost, baseUrls, tempDir);
      assert.deepEqual(first, second, `${sourceHost} projection is not deterministic`);
      assert.equal(JSON.parse(first.projection).length, EXPECTED_SOURCE_COUNTS[sourceHost]);
      assert.match(first.nginx, /URL Alias Authority:/);
      assert.match(first.worker, /redirectAuthority/);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(
    `[verify-url-alias-authority] passed (sources=${summary.sources}, targets=${summary.targets}, many-to-one=${summary.manyToOneTargets}, digest=${summary.digest})`
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
