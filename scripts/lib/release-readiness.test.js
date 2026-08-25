const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildDeterministicReadiness,
  digestJson,
  normalizeSolutionsEvidence,
  sha256,
  stableJson,
  verifyResponseDirectory
} = require('./release-readiness');

function passingEvidence() {
  return {
    producer: 'fastgpt-solutions-preview-http-runner',
    runnerVersion: 1,
    status: 'passed',
    repository: { url: 'https://github.com/example/solutions' },
    revision: 'abcdef1234567',
    target: 'https://preview.example.com',
    approvedTarget: true,
    capturedAt: '2026-08-24T00:00:00.000Z',
    checks: {
      root: 'passed',
      routes: 'passed',
      robots: { status: 'passed' },
      sitemap: { status: 'passed' },
      canonical: { status: 'passed' },
      'internal-links': { status: 'passed' },
      projections: { status: 'passed' }
    },
    artifacts: [
      'root',
      'routes',
      'robots',
      'sitemap',
      'canonical',
      'internal-links',
      'projections'
    ].map((name) => ({
      path: `responses/${name}.body`,
      bytes: 10,
      sha256: 'a'.repeat(64),
      capturedAt: '2026-08-24T00:00:00.000Z'
    })),
    responses: [
      'root',
      'routes',
      'robots',
      'sitemap',
      'canonical',
      'internal-links',
      'projections'
    ].map((name) => ({
      name,
      requestPath:
        name === 'root'
          ? '/'
          : name === 'robots'
          ? '/robots.txt'
          : name === 'sitemap'
          ? '/sitemap.xml'
          : `/${name}`,
      artifactPath: `responses/${name}.body`,
      status: 200,
      expectedStatus: 200,
      bytes: 10,
      sha256: 'a'.repeat(64)
    }))
  };
}

test('stable JSON and deterministic digest ignore object key order', () => {
  assert.equal(stableJson({ b: 2, a: 1 }), stableJson({ a: 1, b: 2 }));
  assert.equal(digestJson({ b: 2, a: 1 }), digestJson({ a: 1, b: 2 }));
});

test('Solutions preview evidence requires owner revision and passing checks', () => {
  const trusted = { approvedTarget: 'https://preview.example.com' };
  const result = normalizeSolutionsEvidence(passingEvidence(), trusted);
  assert.equal(result.status, 'passed');
  assert.equal(result.claim, true);
  assert.equal(result.evidenceTier, 'preview-http');
  assert.equal(result.checks.length, 7);
  assert.equal(result.responses.length, 7);

  const invalid = normalizeSolutionsEvidence(
    { ...passingEvidence(), revision: '', checks: {} },
    trusted
  );
  assert.equal(invalid.status, 'blocked');
  assert.equal(invalid.claim, false);
  assert(invalid.blockers.some(({ code }) => code === 'solutions-owner-revision-missing'));
  assert(invalid.blockers.some(({ code }) => code === 'solutions-http-checks-missing'));

  const incomplete = normalizeSolutionsEvidence(
    {
      ...passingEvidence(),
      checks: { root: 'passed' }
    },
    trusted
  );
  assert(incomplete.blockers.some(({ code }) => code === 'solutions-http-check-required:routes'));

  const aliased = normalizeSolutionsEvidence(
    {
      ...passingEvidence(),
      checks: {
        root: 'passed',
        'route-inventory': 'passed',
        'robots-txt': 'passed',
        'sitemap-xml': 'passed',
        canonicals: 'passed',
        'internal-link': 'passed',
        'markdown-text-projections': 'passed'
      }
    },
    trusted
  );
  assert(aliased.blockers.some(({ code }) => code === 'solutions-http-check-required:routes'));

  const nulPath = normalizeSolutionsEvidence(
    {
      ...passingEvidence(),
      responses: passingEvidence().responses.map((response, index) =>
        index === 0 ? { ...response, requestPath: '/routes\0' } : response
      )
    },
    trusted
  );
  assert(nulPath.blockers.some(({ code }) => code === 'solutions-response-invalid:root'));

  const untrusted = normalizeSolutionsEvidence(
    { ...passingEvidence(), producer: undefined },
    trusted
  );
  assert(
    untrusted.blockers.some(({ code }) => code === 'solutions-http-runner-provenance-missing')
  );
  const credentialed = normalizeSolutionsEvidence(
    {
      ...passingEvidence(),
      repository: { url: 'https://user:secret@github.com/example/solutions' }
    },
    trusted
  );
  assert(
    credentialed.blockers.some(({ code }) => code === 'solutions-owner-repository-credentials')
  );
  assert(!JSON.stringify(credentialed).includes('secret'));

  const credentialedTarget = normalizeSolutionsEvidence(
    { ...passingEvidence(), target: 'https://user:secret@preview.example.com' },
    trusted
  );
  assert(
    credentialedTarget.blockers.some(({ code }) => code === 'solutions-preview-target-invalid')
  );
  assert(!JSON.stringify(credentialedTarget).includes('secret'));

  const privateTarget = normalizeSolutionsEvidence(
    { ...passingEvidence(), target: 'https://127.0.0.1' },
    { approvedTarget: 'https://127.0.0.1' }
  );
  assert(privateTarget.blockers.some(({ code }) => code === 'solutions-preview-target-invalid'));
  assert(privateTarget.blockers.some(({ code }) => code === 'solutions-approved-target-invalid'));

  const sensitiveHeader = normalizeSolutionsEvidence(
    {
      ...passingEvidence(),
      responses: passingEvidence().responses.map((response, index) =>
        index === 0
          ? { ...response, headers: { 'x-api-key': 'secret', 'x-robots-tag': 'noindex' } }
          : response
      )
    },
    trusted
  );
  assert.equal(sensitiveHeader.responses[0].headers['x-api-key'], undefined);
  assert.equal(sensitiveHeader.responses[0].headers['x-robots-tag'], 'noindex');

  const nonHttp = normalizeSolutionsEvidence(
    {
      ...passingEvidence(),
      responses: passingEvidence().responses.map((response, index) => ({
        ...response,
        status: index === 0 ? 503 : response.status
      }))
    },
    trusted
  );
  assert(
    nonHttp.blockers.some(({ code }) => code === 'solutions-response-expected-status-mismatch:root')
  );

  const repeatedPaths = normalizeSolutionsEvidence(
    {
      ...passingEvidence(),
      responses: passingEvidence().responses.map((response) => ({
        ...response,
        requestPath: '/'
      }))
    },
    trusted
  );
  assert(
    repeatedPaths.blockers.some(({ code }) => code === 'solutions-response-path-duplicate:routes')
  );

  const sharedArtifact = normalizeSolutionsEvidence(
    {
      ...passingEvidence(),
      artifacts: passingEvidence().artifacts.map((artifact) => ({
        ...artifact,
        path: 'responses/shared.body'
      })),
      responses: passingEvidence().responses.map((response) => ({
        ...response,
        artifactPath: 'responses/shared.body'
      }))
    },
    trusted
  );
  assert(
    sharedArtifact.blockers.some(
      ({ code }) => code === 'solutions-response-artifact-shared:root:routes'
    )
  );

  const missingExpectedStatus = normalizeSolutionsEvidence(
    {
      ...passingEvidence(),
      responses: passingEvidence().responses.map((response) => ({
        ...response,
        expectedStatus: undefined,
        status: 201
      }))
    },
    trusted
  );
  assert(
    missingExpectedStatus.blockers.some(
      ({ code }) => code === 'solutions-response-expected-status-missing:root'
    )
  );

  const unbound = normalizeSolutionsEvidence(
    {
      ...passingEvidence(),
      artifacts: []
    },
    trusted
  );
  assert(unbound.blockers.some(({ code }) => code === 'solutions-response-artifact-missing:root'));
});

test('deterministic readiness excludes observation timestamps', () => {
  const base = {
    status: 'release-blocked',
    evidence: { releaseEligible: false },
    evidenceTiers: {
      'source-verified': { state: 'verified', claim: true },
      'export-verified': { state: 'verified', claim: true },
      'release-eligible': { state: 'blocked', claim: false },
      'production-observed': { state: 'not-observed', claim: false },
      'search-observed': { state: 'not-observed', claim: false }
    },
    counts: { faq: 1400 },
    variants: [
      {
        variant: 'preview',
        outcome: 'export-verified',
        counts: { faqPages: 1400 },
        artifacts: { capturedAt: 'one', files: [{ capturedAt: 'one', sha256: 'c'.repeat(64) }] }
      }
    ],
    crossProjectInputs: { solutionsPreviewHttp: normalizeSolutionsEvidence() },
    blockers: [{ label: 'external evidence', detail: 'captured at run time', capturedAt: 'one' }],
    artifacts: [
      {
        path: 'out',
        bytes: 1,
        sha256: 'a'.repeat(64),
        capturedAt: 'one',
        files: [{ path: 'out/sitemap.xml', bytes: 1, sha256: 'a'.repeat(64), capturedAt: 'one' }]
      }
    ],
    rollback: {
      inventory: [{ path: 'rollback.json', bytes: 1, sha256: 'b'.repeat(64), capturedAt: 'one' }]
    }
  };
  const first = buildDeterministicReadiness(base);
  const second = buildDeterministicReadiness({
    ...base,
    blockers: [{ ...base.blockers[0], capturedAt: 'two' }],
    artifacts: [
      {
        ...base.artifacts[0],
        capturedAt: 'two',
        files: [{ ...base.artifacts[0].files[0], capturedAt: 'two' }]
      }
    ],
    variants: [
      {
        variant: 'preview',
        outcome: 'export-verified',
        counts: { faqPages: 1400 },
        artifacts: { capturedAt: 'two', files: [{ capturedAt: 'two', sha256: 'c'.repeat(64) }] }
      }
    ],
    rollback: { inventory: [{ ...base.rollback.inventory[0], capturedAt: 'two' }] }
  });
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.crossProjectInputs.solutionsPreviewHttp.status, 'not-provided');
  assert.equal(first.evidenceTiers['search-observed'].claim, false);

  const evidence = passingEvidence();
  const firstWithEvidence = buildDeterministicReadiness({
    ...base,
    issue: { number: 247, url: 'https://github.com/labring/fastgpt-home/issues/247' },
    crossProjectInputs: {
      solutionsPreviewHttp: normalizeSolutionsEvidence(evidence, {
        approvedTarget: 'https://preview.example.com'
      })
    }
  });
  const secondWithEvidence = buildDeterministicReadiness({
    ...base,
    issue: { number: 247, url: 'https://github.com/labring/fastgpt-home/issues/247' },
    crossProjectInputs: {
      solutionsPreviewHttp: normalizeSolutionsEvidence(
        {
          ...evidence,
          capturedAt: '2026-08-25T00:00:00.000Z',
          artifacts: evidence.artifacts.map((artifact) => ({
            ...artifact,
            capturedAt: '2026-08-25T00:00:00.000Z'
          }))
        },
        { approvedTarget: 'https://preview.example.com' }
      )
    }
  });
  assert.equal(firstWithEvidence.sha256, secondWithEvidence.sha256);
});

test('response artifact verification preserves nested relative paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'solutions-response-artifacts-'));
  const responseDirectory = path.join(root, 'responses');
  const body = Buffer.from('nested body');
  fs.mkdirSync(path.join(responseDirectory, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(responseDirectory, 'nested', 'root.body'), body);
  try {
    const response = {
      name: 'root',
      artifactPath: 'nested/root.body',
      bytes: body.length,
      sha256: sha256(body)
    };
    assert.deepEqual(verifyResponseDirectory([response], responseDirectory), []);
    fs.writeFileSync(path.join(responseDirectory, 'root.body'), 'wrong body');
    assert.deepEqual(
      verifyResponseDirectory([{ ...response, artifactPath: 'root.body' }], responseDirectory),
      [{ code: 'solutions-response-artifact-file-mismatch:root' }]
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
