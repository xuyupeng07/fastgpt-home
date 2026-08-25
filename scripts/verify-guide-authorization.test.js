const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const {
  evaluateGuideAuthorization,
  loadFixture,
  projectGuideEntries,
  verifyAuthorizationFixtures
} = require('./verify-guide-authorization');

const registry = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/content/guides/registry.json'), 'utf8')
);

test('complete authorization fixture publishes both finance pairs', () => {
  const fixture = loadFixture('complete');
  const result = verifyAuthorizationFixtures({ fixture });

  assert.equal(result.status, 'passed');
  assert.equal(result.complete.projectedEntries, 13);
  assert.deepEqual(result.complete.financeSlugs, [
    'finance-research-retrieval',
    'finance-daily-report-automation'
  ]);
  assert(result.complete.decisions.every((decision) => decision.status === 'publishable'));
});

test('missing authorization fixture blocks and excludes both finance pairs', () => {
  const fixture = loadFixture('missing');
  const result = verifyAuthorizationFixtures({ fixture });

  assert.equal(result.status, 'passed');
  assert.equal(result.missing.projectedEntries, 11);
  assert.deepEqual(result.missing.financeSlugs, []);
  assert.equal(result.missing.decisions.length, 2);
  assert(result.missing.decisions.every((decision) => decision.status === 'release-blocked'));
  assert.match(result.missing.decisions[0].blockers.join('\n'), /case|asset/i);
  assert.match(result.missing.decisions[0].blockers.join('\n'), /evidence/i);
});

test('invalid case or asset evidence produces a release blocker at the public seam', () => {
  const fixture = loadFixture('complete');
  const record = structuredClone(fixture.records['finance-research-retrieval']);
  record.requiredCases[0].evidence.status = 'missing';
  record.requiredAssets[0].evidence.digest = 'invalid';

  const decision = evaluateGuideAuthorization('finance-research-retrieval', record);
  assert.equal(decision.status, 'release-blocked');
  assert.equal(decision.eligible, false);
  assert.match(decision.blockers.join('\n'), /chaoyang-yongxu-research-retrieval/);
  assert.match(decision.blockers.join('\n'), /finance-research-workflow/);
});

test('projection accepts an explicit authority decision map', () => {
  const fixture = loadFixture('complete');
  const decisions = new Map(
    ['finance-research-retrieval', 'finance-daily-report-automation'].map((slug) => [
      slug,
      evaluateGuideAuthorization(slug, fixture.records[slug])
    ])
  );

  const projected = projectGuideEntries(registry.entries, decisions);
  assert.equal(projected.length, 13);
  assert(projected.some((entry) => entry.slug === 'finance-research-retrieval'));
  assert(projected.some((entry) => entry.slug === 'finance-daily-report-automation'));
});
