const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const {
  URL_ALIAS_CONTRACT,
  buildUrlAliasProjection,
  getUrlAliasSlice,
  readUrlAliasAuthority,
  validateUrlAliasAuthority
} = require('./lib/url-alias-authority');

const ROOT = path.resolve(__dirname, '..');

test('rebuilt-slug slice contains the approved host partitions', () => {
  const authority = readUrlAliasAuthority(ROOT);
  const slice = getUrlAliasSlice(authority, 'rebuilt-slug', { rootDir: ROOT });
  assert.equal(slice.records.length, URL_ALIAS_CONTRACT.slices['rebuilt-slug'].sources);
  assert.deepEqual(
    [...slice.records.reduce((counts, record) => counts.set(record.sourceHost, (counts.get(record.sourceHost) || 0) + 1), new Map())],
    Object.entries(URL_ALIAS_CONTRACT.slices['rebuilt-slug'].sourceHosts)
  );
  assert.equal(buildUrlAliasProjection(slice, 'fastgpt.io').size, 531);
  assert.equal(buildUrlAliasProjection(slice, 'fastgpt.cn').size, 14);
});

test('rebuilt-slug slice keeps approved cross-host records explicit', () => {
  const authority = readUrlAliasAuthority(ROOT);
  const slice = getUrlAliasSlice(authority, 'rebuilt-slug', { rootDir: ROOT });
  assert.equal(slice.records.filter((record) => record.reason === 'cross-host').length, 14);
  assert(slice.records.filter((record) => record.sourceHost !== record.targetHost).every((record) => record.targetHost === 'fastgpt.io'));
});

test('authority still rejects an unapproved cross-host mapping when requested', () => {
  assert.throws(
    () =>
      validateUrlAliasAuthority(
        [{ sourceHost: 'fastgpt.cn', sourcePath: '/faq/old', targetHost: 'fastgpt.io', targetPath: '/faq/new' }],
        { rejectCrossHost: true }
      ),
    /cross-host/
  );
});
