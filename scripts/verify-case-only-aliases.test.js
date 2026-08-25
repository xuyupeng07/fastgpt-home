const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const {
  buildUrlAliasProjection,
  getUrlAliasSlice,
  readUrlAliasAuthority,
  validateUrlAliasAuthority
} = require('./lib/url-alias-authority');

const ROOT = path.resolve(__dirname, '..');

test('case-only slice contains the approved host partitions and terminal mappings', () => {
  const authority = readUrlAliasAuthority(ROOT);
  const slice = getUrlAliasSlice(authority, 'case-only', { rootDir: ROOT, requireEvidence: true });

  assert.equal(slice.records.length, 743);
  assert.deepEqual(
    Object.fromEntries(
      ['fastgpt.cn', 'fastgpt.io'].map((host) => [
        host,
        slice.records.filter((record) => record.sourceHost === host).length
      ])
    ),
    { 'fastgpt.cn': 23, 'fastgpt.io': 720 }
  );
  for (const record of slice.records) {
    assert.equal(record.sourceHost, record.targetHost);
    assert.notEqual(record.sourcePath, record.targetPath);
    const sourcePath = record.sourcePath.startsWith('/en/faq/')
      ? record.sourcePath.slice('/en'.length)
      : record.sourcePath;
    assert.equal(sourcePath.toLowerCase(), record.targetPath.toLowerCase());
  }
});

test('case-only slice rejects cross-host and rebuilt-slug records', () => {
  const crossHost = validateUrlAliasAuthority([
    {
      sourceHost: 'fastgpt.cn',
      sourcePath: '/faq/Old-Question',
      targetHost: 'fastgpt.io',
      targetPath: '/faq/old-question',
      reason: 'case-only'
    }
  ]);
  assert.throws(
    () => getUrlAliasSlice(crossHost, 'case-only'),
    /case-only records must stay on one host/
  );

  const rebuiltSlug = validateUrlAliasAuthority([
    {
      sourceHost: 'fastgpt.io',
      sourcePath: '/en/faq/Old-Question',
      targetHost: 'fastgpt.io',
      targetPath: '/faq/different-question',
      reason: 'case-only'
    }
  ]);
  assert.throws(
    () => getUrlAliasSlice(rebuiltSlug, 'case-only'),
    /case-only records must differ only by path case/
  );
});

test('case-only projections are deterministic and scoped to the slice', () => {
  const authority = readUrlAliasAuthority(ROOT);
  const slice = getUrlAliasSlice(authority, 'case-only', { rootDir: ROOT });
  const first = [...buildUrlAliasProjection(slice, 'fastgpt.io')];
  const second = [...buildUrlAliasProjection(slice, 'fastgpt.io')];

  assert.deepEqual(first, second);
  assert.equal(first.length, 720);
  assert(first.every(([source]) => source.startsWith('/faq/') || source.startsWith('/en/faq/')));
  assert(first.every(([, target]) => target.startsWith('https://fastgpt.io/faq/')));
});
