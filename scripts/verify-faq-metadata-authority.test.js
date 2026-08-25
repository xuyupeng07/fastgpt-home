const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  ADDITIONS_PATH,
  BASELINE_PATH,
  AUTHORITY_PATH,
  loadCommitted,
  validateAuthority
} = require('./generate-faq-metadata-authority');
const { loadRouteIdentity, readEnglishFaq } = require('./generate-faq-metadata');

const ROOT = path.resolve(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function context() {
  return {
    authority: loadCommitted(),
    baseline: readJson(BASELINE_PATH),
    additions: readJson(ADDITIONS_PATH).records,
    faqRecords: readEnglishFaq(),
    routeIdentity: loadRouteIdentity()
  };
}

test('committed FAQ authority exposes the reviewed disposition arithmetic', () => {
  const { authority } = context();
  assert.equal(authority.source.sheet, '全量可导入-1407条');
  assert.deepEqual(authority.counts.dispositions, {
    accepted: 1399,
    'semantic-remap': 1,
    'duplicate-loser': 6,
    'no-page': 1
  });
  assert.equal(authority.counts.additions, 205);
  assert.equal(authority.counts.fallback.delta, -205);
  assert.equal(authority.counts.fallback.after, 0);
  assert.equal(
    authority.records.filter((record) => record.disposition === 'no-page')[0].businessNo,
    1628
  );
});

test('candidate disposition and stable identity rules reject drift', () => {
  const { authority, baseline, additions, faqRecords, routeIdentity } = context();
  const mutated = structuredClone(authority);
  const semantic = mutated.records.find((record) => record.disposition === 'semantic-remap');
  semantic.contentId = 'how-ai-intelligent-platforms-enhance';
  assert.throws(
    () => validateAuthority(mutated, { faqRecords, routeIdentity, baseline, additions }),
    /Semantic remap target drift|Identity set does not equal/
  );
});

test('baseline digest rejects an unapproved metadata field change', () => {
  const { authority, baseline, additions, faqRecords, routeIdentity } = context();
  const mutatedBaseline = structuredClone(baseline);
  mutatedBaseline.records[0].description += ' drift';
  assert.throws(
    () =>
      validateAuthority(authority, {
        faqRecords,
        routeIdentity,
        baseline: mutatedBaseline,
        additions
      }),
    /Baseline digest drift/
  );
});

test('the approved increment remains an exact source projection', () => {
  const additions = readJson(ADDITIONS_PATH).records;
  assert.equal(additions.length, 205);
  assert.equal(new Set(additions.map((record) => record.contentId)).size, 205);
  const addition = additions[0];
  assert.equal(addition.contentId, 'can-ai-intelligent-customer-service');
  assert.equal(addition.title, 'How AI Lowers Customer Service Labor Costs');
  assert.equal(
    addition.description,
    'Discover how automating routine inquiries with NLP and ML reduces labor costs by handling order status and troubleshooting 24/7.'
  );
  assert.equal(
    additions.at(-1).contentId,
    'do-ai-agents-comply-with-children-s-privacy-protection-regulations'
  );
  assert(fs.existsSync(AUTHORITY_PATH));
});
