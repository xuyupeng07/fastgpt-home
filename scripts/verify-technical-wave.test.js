const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  WAVE_MAX_CANDIDATES,
  WAVE_MIN_CANDIDATES,
  buildReaderDocument,
  buildWaveProjection,
  chooseWaveCandidates,
  loadWaveInputs,
  verifyWaveSource
} = require('./lib/technical-wave');
const { applyRollbackProjection } = require('./lib/technical-authority');

const ROOT = path.resolve(__dirname, '..');

test('Wave 1 selection is bounded, deterministic, and topic-diverse', () => {
  const first = loadWaveInputs(ROOT);
  const second = loadWaveInputs(ROOT);
  const firstSelection = chooseWaveCandidates(
    first.authority,
    first.entries,
    first.approvedSelection
  );
  const secondSelection = chooseWaveCandidates(
    second.authority,
    second.entries,
    second.approvedSelection
  );

  assert.equal(firstSelection.candidates.length, 50);
  assert(firstSelection.candidates.length >= WAVE_MIN_CANDIDATES);
  assert(firstSelection.candidates.length <= WAVE_MAX_CANDIDATES);
  assert.deepEqual(
    firstSelection.candidates.map((candidate) => candidate.id),
    secondSelection.candidates.map((candidate) => candidate.id)
  );
  assert.deepEqual(
    firstSelection.candidates.map((candidate) => candidate.id),
    first.approvedSelection.candidateIds
  );
  assert(firstSelection.topicCount >= 4);
  assert(firstSelection.candidates.every((candidate) => candidate.state === 'accepted'));
  assert(
    firstSelection.candidates.every((candidate) => candidate.security.status !== 'needs-review')
  );
  assert(firstSelection.candidates.every((candidate) => candidate.operationRisk.level !== 'D0'));
});

test('reader projection contains the required public content contract', () => {
  const { authority } = loadWaveInputs(ROOT);
  const candidate = authority.candidates.find((entry) => entry.id === 'week05-0001');
  const document = buildReaderDocument(candidate);

  for (const section of ['适用环境与版本范围', '问题指纹', '安全护栏', '回滚指引', '维护者证据']) {
    assert(document.includes(`## ${section}`), section);
  }
  assert(document.includes(candidate.provenance.sourceUrl));
  assert(document.includes('[REDACTED_CREDENTIAL]'));
  assert.doesNotMatch(document, /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/i);
  assert.doesNotMatch(document, /\bBearer\s+(?!\[REDACTED_CREDENTIAL\])[A-Za-z0-9._~+/=-]{6,}/i);
});

test('wave projection keeps one identity set across registry, search, sitemap, export, release, and rollback', () => {
  const { authority, entries, approvedSelection } = loadWaveInputs(ROOT);
  const selection = chooseWaveCandidates(authority, entries, approvedSelection);
  const projection = buildWaveProjection({ authority, entries, selection });

  assert.equal(projection.baselinePageCount, 1122);
  assert.equal(projection.acceptedAdd, 50);
  assert.equal(projection.acceptedUpdate, 0);
  assert.equal(projection.resultingPageCount, 1172);
  assert.equal(projection.publicationCount, 50);
  assert.equal(projection.identities.length, 50);
  assert.deepEqual(
    projection.identities.map((identity) => identity.key).sort(),
    projection.registry.map((entry) => entry.identity).sort()
  );
  assert.deepEqual(
    projection.identities.map((identity) => identity.key).sort(),
    projection.rollback.map((entry) => entry.identity).sort()
  );
});

test('updates preserve the page-count baseline while additions increase it', () => {
  const { authority, entries, approvedSelection } = loadWaveInputs(ROOT);
  const selection = chooseWaveCandidates(authority, entries, approvedSelection);
  const updateSelection = {
    ...selection,
    candidates: selection.candidates.map((candidate, index) =>
      index === 0
        ? { ...candidate, decision: { ...candidate.decision, operation: 'update' } }
        : candidate
    )
  };
  const projection = buildWaveProjection({ authority, entries, selection: updateSelection });

  assert.equal(projection.acceptedAdd, 49);
  assert.equal(projection.acceptedUpdate, 1);
  assert.equal(projection.publicPageDelta, 49);
  assert.equal(projection.resultingPageCount, 1171);
});

test('source verification accepts the committed Wave 1 package', () => {
  const result = verifyWaveSource(ROOT);
  assert.equal(result.wave, 'wave-1');
  assert.equal(result.selectedCount, 50);
  assert.equal(result.resultingPageCount, 1172);
  assert.equal(result.sourceVerified, true);
});

test('partial projection failure restores every public surface', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-wave-rollback-'));
  const files = ['registry', 'search', 'sitemap', 'static-export', 'release', 'rollback'].map(
    (surface) => path.join(temporaryRoot, `${surface}.json`)
  );
  const before = files.map((filePath) => {
    fs.writeFileSync(filePath, `baseline:${path.basename(filePath)}\n`);
    return fs.readFileSync(filePath);
  });

  try {
    assert.throws(
      () =>
        applyRollbackProjection({
          files,
          contents: files.map(() => Buffer.from('wave-1\n')),
          failAt: 4
        }),
      /Projection failure at surface 4/
    );
    files.forEach((filePath, index) => assert.deepEqual(fs.readFileSync(filePath), before[index]));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
