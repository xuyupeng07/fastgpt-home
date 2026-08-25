const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildUrlAliasProjection,
  getUrlAliasAuthorityDigest,
  validateUrlAliasAuthority
} = require('./lib/url-alias-authority');

const record = (sourcePath, targetPath, sourceHost = 'fastgpt.io', targetHost = sourceHost) => ({
  sourceHost,
  sourcePath,
  targetHost,
  targetPath
});

test('authority allows many-to-one terminal mappings', () => {
  const authority = validateUrlAliasAuthority([
    record('/faq/old-one', '/faq/current'),
    record('/faq/old-two', '/faq/current')
  ]);

  assert.equal(authority.records.length, 2);
  assert.equal(
    buildUrlAliasProjection(authority, 'fastgpt.io').get('/faq/old-one'),
    'https://fastgpt.io/faq/current'
  );
});

test('authority rejects source-to-many, chains, and cycles', () => {
  assert.throws(
    () =>
      validateUrlAliasAuthority([record('/faq/old', '/faq/one'), record('/faq/old', '/faq/two')]),
    /source-to-many/
  );
  assert.throws(
    () =>
      validateUrlAliasAuthority([
        record('/faq/old', '/faq/middle'),
        record('/faq/middle', '/faq/new')
      ]),
    /redirect chain/
  );
  assert.throws(
    () =>
      validateUrlAliasAuthority([
        record('/faq/old', '/faq/middle'),
        record('/faq/middle', '/faq/old')
      ]),
    /redirect cycle/
  );
});

test('authority rejects malformed hosts and paths', () => {
  assert.throws(
    () => validateUrlAliasAuthority([record('/faq/old', '/faq/new', 'example.com')]),
    /sourceHost/
  );
  assert.throws(() => validateUrlAliasAuthority([record('faq/old', '/faq/new')]), /sourcePath/);
  assert.throws(
    () => validateUrlAliasAuthority([record('/faq/old?query=1', '/faq/new')]),
    /query strings/
  );
  assert.throws(
    () => validateUrlAliasAuthority([record('/faq/%ZZ', '/faq/new')]),
    /percent escape/
  );
  assert.throws(
    () => validateUrlAliasAuthority([record('/faq/%2e%2e/current', '/faq/new')]),
    /ambiguous encoded path segment/
  );
  assert.throws(
    () => validateUrlAliasAuthority([record('/faq/old\\new', '/faq/new')]),
    /path character/
  );
  assert.throws(
    () => validateUrlAliasAuthority([record('/faq/old"new', '/faq/new')]),
    /path character/
  );
});

test('authority digest is deterministic', () => {
  const authority = validateUrlAliasAuthority([
    record('/faq/z-old', '/faq/current'),
    record('/faq/a-old', '/faq/current')
  ]);
  assert.equal(
    getUrlAliasAuthorityDigest(authority),
    getUrlAliasAuthorityDigest(validateUrlAliasAuthority([...authority.records].reverse()))
  );
});
