const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  applyRollbackProjection,
  buildCountInvariant,
  closeAuthority,
  getTemporaryCandidates,
  loadTechnicalAuthority,
  projectAuthority,
  projectTracer,
  validateTechnicalAuthority,
  verifyProjectionConsistency,
  verifyPersistedArtifacts
} = require('./lib/technical-authority');

const ROOT = path.resolve(__dirname, '..');
const AUTHORITY_PATH = path.join(ROOT, 'src/content/tech-center/authority/week05-authority.json');
const TRACER_PATH = path.join(ROOT, 'scripts/fixtures/technical-authority/week05-tracer.json');

test('Week05 authority preserves the historical 454 accepted and 6 denied baseline', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const result = validateTechnicalAuthority(authority, { verifyHistory: true });

  assert.equal(result.history.accepted, 454);
  assert.equal(result.history.denied, 6);
  assert.equal(result.candidates, 888);
  assert.equal(result.temporary, result.needsEvidence + result.deferred);
  assert.equal(result.temporary, 0);
  assert.equal(authority.batch.status, 'closed');
  assert.equal(authority.governance.status, 'governance-complete');
  assert.equal(authority.governance.publicationCount, 0);
});

test('Week05 closure records an evidenced final disposition for every candidate', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const finalIds = new Set([...authority.final.accepted, ...authority.final.denied]);
  const securityFindings = authority.candidates.flatMap((candidate) => candidate.security.findings);
  const operationFindings = authority.candidates.flatMap(
    (candidate) => candidate.operationRisk.findings
  );

  assert.equal(finalIds.size, 888);
  assert.equal(authority.final.accepted.length, 854);
  assert.equal(authority.final.denied.length, 34);
  assert.equal(authority.counts.resultingPageCount, 1976);
  assert.equal(authority.temporary.needsEvidence.length, 0);
  assert.equal(authority.temporary.deferred.length, 0);
  assert.equal(authority.identityConflicts.length, 4);
  assert.equal(authority.relations.length, 9);
  assert(
    authority.relations.every((relation) =>
      ['merged', 'distinct', 'denied'].includes(relation.resolution)
    )
  );
  assert.equal(securityFindings.length, 62);
  assert(
    securityFindings.every((finding) =>
      ['redacted', 'cleared', 'denied'].includes(finding.disposition)
    )
  );
  assert(securityFindings.every((finding) => /^https:\/\//.test(finding.evidence)));
  assert.equal(operationFindings.length, 27);
  assert(
    operationFindings.every((finding) =>
      ['denied', 'safeguarded', 'cleared'].includes(finding.disposition)
    )
  );
  assert(operationFindings.every((finding) => /^https:\/\//.test(finding.evidence)));
  assert(
    authority.candidates.every(
      (candidate) =>
        candidate.evidence.status === 'verified' &&
        candidate.evidence.sources.length > 0 &&
        /^https:\/\//.test(candidate.provenance.sourceUrl) &&
        finalIds.has(candidate.id) &&
        candidate.decision.disposition === candidate.state
    )
  );
  assert.deepEqual(
    {
      candidateCount: authority.governance.candidateCount,
      finalAcceptedCount: authority.governance.finalAcceptedCount,
      finalDeniedCount: authority.governance.finalDeniedCount,
      temporaryCount: authority.governance.temporaryCount,
      resolvedRelationCount: authority.governance.resolvedRelationCount,
      unresolvedCredentialCount: authority.governance.unresolvedCredentialCount,
      unresolvedOperationRiskCount: authority.governance.unresolvedOperationRiskCount,
      publicationCount: authority.governance.publicationCount
    },
    {
      candidateCount: 888,
      finalAcceptedCount: 854,
      finalDeniedCount: 34,
      temporaryCount: 0,
      resolvedRelationCount: 9,
      unresolvedCredentialCount: 0,
      unresolvedOperationRiskCount: 0,
      publicationCount: 0
    }
  );
});

test('governance acceptance is independent from Wave 1 publication capacity', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const conflictIds = new Set(authority.identityConflicts.map((conflict) => conflict.candidateId));
  const eligible = authority.candidates.filter(
    (candidate) =>
      !conflictIds.has(candidate.id) &&
      !candidate.relations.some((relation) => relation.resolution !== 'distinct') &&
      candidate.operationRisk.level === 'none' &&
      candidate.security.status !== 'needs-review' &&
      candidate.evidence.status === 'verified' &&
      candidate.evidence.fingerprint.length >= 24
  );

  assert.equal(eligible.length, 854);
  assert(eligible.every((candidate) => candidate.state === 'accepted'));
});

test('closed authority contains no temporary candidates and is closable', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const temporary = getTemporaryCandidates(authority);

  assert.equal(temporary.length, 0);
  assert.doesNotThrow(() => closeAuthority(authority, { verifyHistory: true }));
});

test('authority closure still blocks a temporary candidate introduced by a caller', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const open = structuredClone(authority);
  open.batch.status = 'open';
  open.candidates[1].state = 'needs-evidence';
  open.candidates[1].decision = null;
  open.final.accepted = open.final.accepted.filter((id) => id !== open.candidates[1].id);
  open.temporary.needsEvidence = [open.candidates[1].id];
  open.counts.accepted -= 1;
  open.counts.add -= 1;
  open.counts.resultingPageCount -= 1;
  open.projection.resultingPageCount -= 1;
  open.governance.finalAcceptedCount -= 1;
  open.governance.temporaryCount = 1;
  assert.throws(() => closeAuthority(open), /temporary/i);
});

test('closed authority enforces final disposition and add/update count invariants', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const closed = structuredClone(authority);
  closed.batch.status = 'closed';
  closed.candidates = closed.candidates.map((candidate) => ({
    ...candidate,
    state: 'denied',
    decision: {
      disposition: 'denied',
      reason: 'Fixture closure',
      evidence: [candidate.provenance.sourceUrl]
    }
  }));
  closed.candidates[0] = {
    ...closed.candidates[0],
    state: 'accepted',
    decision: {
      disposition: 'accepted',
      operation: 'add',
      reason: 'Fixture closure',
      evidence: [closed.candidates[0].provenance.sourceUrl]
    }
  };
  closed.final = {
    accepted: [closed.candidates[0].id],
    denied: closed.candidates.slice(1).map((candidate) => candidate.id)
  };
  closed.temporary = { needsEvidence: [], deferred: [] };
  closed.counts = {
    accepted: 1,
    denied: 887,
    add: 1,
    update: 0,
    resultingPageCount: 1123
  };
  closed.projection.resultingPageCount = 1123;
  closed.governance.finalAcceptedCount = 1;
  closed.governance.finalDeniedCount = 887;
  const result = closeAuthority(closed);

  assert.equal(result.accepted, 1);
  assert.equal(result.denied, 887);
  assert.equal(result.add, 1);
  assert.equal(result.update, 0);
  assert.equal(result.accepted, result.add + result.update);
  assert.equal(result.resultingPageCount, 1123);
});

test('count invariant excludes accepted updates from page growth', () => {
  const result = buildCountInvariant({
    baselinePageCount: 1122,
    accepted: [
      { state: 'accepted', decision: { disposition: 'accepted', operation: 'add' } },
      { state: 'accepted', decision: { disposition: 'accepted', operation: 'update' } }
    ],
    denied: []
  });

  assert.deepEqual(result, {
    accepted: 2,
    denied: 0,
    add: 1,
    update: 1,
    resultingPageCount: 1123
  });
});

test('authority rejects identity, relation, evidence, credential, and risk drift', () => {
  const authority = loadTechnicalAuthority(ROOT);

  const identityCollision = structuredClone(authority);
  identityCollision.candidates[1].identity = identityCollision.candidates[0].identity;
  assert.throws(() => validateTechnicalAuthority(identityCollision), /identity collision/i);

  const duplicateRelation = structuredClone(authority);
  duplicateRelation.relations.push(structuredClone(duplicateRelation.relations[0]));
  assert.throws(
    () => validateTechnicalAuthority(duplicateRelation),
    /duplicates a relation group/i
  );

  const invalidEvidence = structuredClone(authority);
  invalidEvidence.candidates[1].evidence = {
    ...invalidEvidence.candidates[1].evidence,
    status: 'verified',
    sources: []
  };
  assert.throws(() => validateTechnicalAuthority(invalidEvidence), /require a source/i);

  const credentialFinding = structuredClone(authority);
  const credentialCandidate = credentialFinding.candidates.find(
    (candidate) => candidate.security.findings.length
  );
  credentialCandidate.security.findings[0].value = 'secret-shaped-value';
  assert.throws(() => validateTechnicalAuthority(credentialFinding), /credential-shaped values/i);

  const invalidRisk = structuredClone(authority);
  const d0Candidate = invalidRisk.candidates.find(
    (candidate) => candidate.operationRisk.level === 'D0'
  );
  d0Candidate.operationRisk.decision = 'review';
  assert.throws(() => validateTechnicalAuthority(invalidRisk), /D0 records require a denial/i);

  const governanceDrift = structuredClone(authority);
  governanceDrift.governance.finalDeniedCount -= 1;
  assert.throws(() => validateTechnicalAuthority(governanceDrift), /governance/i);

  const acceptedEvidenceDrift = structuredClone(authority);
  delete acceptedEvidenceDrift.candidates.find((candidate) => candidate.state === 'accepted')
    .decision.evidence;
  assert.throws(() => validateTechnicalAuthority(acceptedEvidenceDrift), /decision\.evidence/i);
});

test('tracer projection shares one identity set across all public surfaces', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const tracer = JSON.parse(fs.readFileSync(TRACER_PATH, 'utf8'));
  const projection = projectTracer(authority, tracer);

  assert.equal(projection.identities.length, 1);
  assert.equal(projection.registry.length, 1);
  assert.equal(projection.search.length, 1);
  assert.equal(projection.sitemap.length, 1);
  assert.equal(projection.staticExport.length, 1);
  assert.equal(projection.releaseRecord.length, 1);
  assert.equal(projection.rollback.length, 1);
  assert.doesNotThrow(() => verifyProjectionConsistency(projection));
});

test('full Wave 0 projections are deterministic and artifact-backed', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const first = projectAuthority(authority);
  const second = projectAuthority(authority);

  assert.equal(first.mode, 'dry-run');
  assert.equal(first.publicationCount, 0);
  assert.equal(first.identities.length, authority.counts.accepted);
  assert.deepEqual(first, second);
  const persisted = verifyPersistedArtifacts(authority, ROOT);
  assert.deepEqual(first, persisted.projection);
});

test('projection consistency requires one unique identity per surface', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const projection = projectAuthority(authority);
  projection.registry.push(structuredClone(projection.registry[0]));
  assert.throws(
    () => verifyProjectionConsistency(projection),
    /cardinality|duplicate|identity drift/i
  );
});

test('rollback projection restores every surface after a failed write', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-projection-'));
  const surfaces = [
    'registry',
    'search',
    'sitemap',
    'static-export',
    'release-record',
    'rollback'
  ].map((name) => path.join(temporaryRoot, `${name}.json`));
  surfaces.forEach((filePath) => fs.writeFileSync(filePath, '{"version":"baseline"}\n'));
  const before = surfaces.map((filePath) => fs.readFileSync(filePath));

  try {
    assert.throws(
      () =>
        applyRollbackProjection({
          files: surfaces,
          contents: surfaces.map(() => '{"version":"tracer"}\n'),
          failAt: 3
        }),
      /projection failure/i
    );
    surfaces.forEach((filePath, index) =>
      assert.deepEqual(fs.readFileSync(filePath), before[index])
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('committed authority and tracer fixtures remain schema-valid', () => {
  assert(fs.existsSync(AUTHORITY_PATH));
  assert(fs.existsSync(TRACER_PATH));
  assert.doesNotThrow(() => validateTechnicalAuthority(loadTechnicalAuthority(ROOT)));
});
