const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const packageJson = require('../package.json');
const packageLock = require('../package-lock.json');

const {
  appendP1HistoricalBaselineAdvisories,
  createReleaseRecord,
  extractP1SuccessMeasurement,
  getSourceExecutionOrder,
  getSourceNodeSteps,
  getSourceNpmSteps,
  getVariantExecutionOrder,
  getVariantSteps,
  isReleaseGateBlocked,
  parseArgs: parseReleaseArgs
} = require('./verify-release');
const { recordStep } = require('./lib/release-record');
const { retainSuccessArtifacts } = require('./lib/release-artifacts');
const { normalizeSolutionsEvidence } = require('./lib/release-readiness');
const { buildOwnerExpectationSet, parseArgs } = require('./verify-faq-metadata');
const { normalizeFaqMetadataPolicy } = require('./generate-faq-metadata');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function writeFaqFixture(record) {
  const metadata = normalizeFaqMetadataPolicy({
    title: record.Title,
    description: record.Description
  });
  const jsonLd = JSON.stringify({ '@type': 'Question', name: record.Question }).replaceAll(
    '<',
    '\\u003c'
  );
  const html = [
    '<!doctype html>',
    `<title>${escapeHtml(metadata.title)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}">`,
    `<meta name="keywords" content="${escapeHtml(record.Keywords.split(', ').join(','))}">`,
    `<h1>${escapeHtml(record.Question)}</h1>`,
    `<script type="application/ld+json">${jsonLd}</script>`
  ].join('');
  const fixturePath = path.join(OUT_DIR, 'faq', `${record.routeKey}.html`);
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, html);
}

function hasCaseInsensitiveRouteCollision(records) {
  const routeKeys = new Set();
  for (const { routeKey } of records) {
    const normalized = routeKey.toLowerCase();
    if (routeKeys.has(normalized)) return true;
    routeKeys.add(normalized);
  }
  return false;
}

function isCaseSensitiveFilesystem() {
  const probeDir = fs.mkdtempSync(path.join(ROOT, '.faq-case-probe-'));
  const uppercaseProbe = path.join(probeDir, 'CaseProbe');
  const lowercaseProbe = path.join(probeDir, 'caseprobe');
  try {
    fs.writeFileSync(uppercaseProbe, 'case probe');
    return !fs.existsSync(lowercaseProbe);
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

function failure(label, output, variant = 'io') {
  const id = label.startsWith('P1 ') ? 'p1.export' : 'test.failure';
  return { id, label, variant, command: 'npm run verify:p1', output };
}

test('release plans compose FAQ, Guide, and variant checks with stable step IDs', () => {
  const sourceIds = getSourceNodeSteps().map(([stepId]) => stepId);
  assert.deepEqual(
    sourceIds.filter((stepId) => stepId.startsWith('faq-')),
    [
      'faq-route-registry.source',
      'faq-metadata-snapshot.source',
      'faq-routes.source',
      'faq-metadata-legacy.source',
      'faq-metadata.source',
      'faq-seo-graph.source',
      'faq-redirects.source'
    ]
  );

  const record = createReleaseRecord({ sourceOnly: true });
  assert.deepEqual(
    record.evidence.guidePairs.expected.map((pair) => pair.slug),
    [
      'poc-30-day-design',
      'database-qa-integration-guide',
      'scheduled-report-automation',
      'finance-research-retrieval',
      'finance-daily-report-automation'
    ]
  );
  const variantOrder = getVariantExecutionOrder('cn');
  assert.equal(variantOrder[0], 'variant.build');
  assert(variantOrder.indexOf('content-hygiene.html') < variantOrder.indexOf('guide.export'));
});

test('release coordinator gates technical content and every site variant', () => {
  const sourceCommands = getSourceNpmSteps().flatMap(([, , args]) => args);
  for (const command of [
    'verify:technical-content',
    'verify:technical-content-regression',
    'verify:technical-center-regression',
    'verify:technical-export-regression',
    'verify:release-readiness'
  ]) {
    assert(sourceCommands.includes(command), command);
  }
  for (const variant of ['cn', 'io', 'preview']) {
    const variantIds = getVariantExecutionOrder(variant);
    assert(variantIds.includes('technical-center.export'));
    assert(variantIds.includes('technical-export.export'));
    assert(variantIds.includes('technical-wave.export'));
  }
});

test('release coordinator records and gates the case-only alias slice independently', () => {
  const sourceStep = getSourceNodeSteps().find(([stepId]) => stepId === 'case-only.source');
  const regressionStep = getSourceNpmSteps().find(([stepId]) => stepId === 'case-only.regression');
  const httpStep = getVariantSteps('cn').find((step) => step.id === 'case-only.http');

  assert.equal(sourceStep[2], 'scripts/verify-case-only-aliases.js');
  assert.deepEqual(regressionStep[2], ['verify:case-only-regression']);
  assert.deepEqual(httpStep.args, ['--variant', 'cn', '--slice', 'case-only']);
  assert.equal(
    getVariantSteps('preview').some((step) => step.id === 'case-only.http'),
    false
  );
  assert.equal(packageJson.scripts['verify:case-only'], 'node scripts/verify-case-only-aliases.js');
  assert.equal(
    packageJson.scripts['verify:case-only-regression'],
    'node --test scripts/verify-case-only-aliases.test.js'
  );
  assert.equal(
    packageJson.scripts['verify:guide-authorization'],
    'node scripts/verify-guide-authorization.js'
  );
  assert.equal(
    packageJson.scripts['verify:guide-authorization-regression'],
    'node --test scripts/verify-guide-authorization.test.js'
  );
});

test('release coordinator accepts the preview Site Variant', () => {
  assert.deepEqual(parseReleaseArgs(['--variant', 'preview']), {
    sourceOnly: false,
    keepArtifacts: false,
    retainSuccessArtifacts: undefined,
    variant: 'preview'
  });
});

test('release coordinator accepts a separately supplied Solutions preview evidence file', () => {
  assert.deepEqual(parseReleaseArgs(['--solutions-evidence', 'evidence.json']), {
    sourceOnly: false,
    keepArtifacts: false,
    retainSuccessArtifacts: undefined,
    variant: undefined,
    solutionsEvidence: 'evidence.json'
  });
  assert.throws(
    () => parseReleaseArgs(['--solutions-preview-evidence']),
    /requires a JSON file path/
  );

  const evidence = normalizeSolutionsEvidence(
    {
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
        robots: 'passed',
        sitemap: 'passed',
        canonical: 'passed',
        'internal-links': 'passed',
        projections: 'passed'
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
        bytes: 1,
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
        bytes: 1,
        sha256: 'a'.repeat(64)
      }))
    },
    { approvedTarget: 'https://preview.example.com' }
  );
  assert.equal(evidence.source, 'cross-project');
  assert.equal(evidence.evidenceTier, 'preview-http');
  assert.equal(evidence.claim, true);
  assert.deepEqual(
    parseReleaseArgs([
      '--solutions-http-target',
      'https://preview.example.com',
      '--solutions-approved-target',
      'https://preview.example.com',
      '--solutions-http-contract',
      'contract.json'
    ]),
    {
      sourceOnly: false,
      keepArtifacts: false,
      retainSuccessArtifacts: undefined,
      variant: undefined,
      solutionsHttpTarget: 'https://preview.example.com',
      solutionsApprovedTarget: 'https://preview.example.com',
      solutionsHttpContract: 'contract.json'
    }
  );
  assert.throws(
    () => parseReleaseArgs(['--solutions-http-target', 'https://preview.example.com']),
    /requires --solutions-http-contract/
  );
});

test('pull-request verification permits only absent Solutions evidence', () => {
  const missingEvidence = normalizeSolutionsEvidence();
  const invalidEvidence = { ...missingEvidence, status: 'invalid' };
  const options = parseReleaseArgs(['--allow-missing-solutions-evidence']);

  assert.equal(options.allowMissingSolutionsEvidence, true);
  assert.equal(isReleaseGateBlocked([], missingEvidence), true);
  assert.equal(isReleaseGateBlocked([], missingEvidence, options), false);
  assert.equal(isReleaseGateBlocked([], invalidEvidence, options), true);
  assert.equal(
    isReleaseGateBlocked([failure('failed check', 'failed')], missingEvidence, options),
    true
  );
});

test('release record keeps evidence tiers and rollback inventory separate', () => {
  const record = createReleaseRecord({ sourceOnly: true });
  assert.equal(record.recordKind, 'week05-release-readiness');
  assert(record.crossProjectInputs.solutionsPreviewHttp);
  assert(Array.isArray(record.rollback.inventory));
  recordStep(
    record,
    'technical-authority.source',
    'A freely editable display label',
    'node scripts/verify-technical-authority.js',
    undefined,
    'passed',
    'TECHNICAL_AUTHORITY_RESULT={"governanceStatus":"governance-complete","publicationCount":0}'
  );
  assert.equal(record.commands.at(-1).id, 'technical-authority.source');
  assert.equal(record.evidence.technicalAuthority.source, true);
  assert.equal(record.evidence.technicalAuthority.observed.publicationCount, 0);
  assert.equal(
    packageJson.scripts['verify:release-readiness'],
    'node --test scripts/lib/release-readiness.test.js'
  );
  assert.equal(
    packageJson.scripts['verify:solutions-preview'],
    'node scripts/verify-solutions-preview-http.js'
  );
  assert.equal(
    packageJson.scripts['verify:solutions-preview-regression'],
    'node --test scripts/lib/solutions-preview-http.test.js'
  );
});

test('preview release gates skip production-only FAQ artifacts and sitemap cardinality', () => {
  const previewIds = getVariantSteps('preview').map((step) => step.id);
  const cnIds = getVariantSteps('cn').map((step) => step.id);

  assert(previewIds.includes('technical-wave.export'));
  assert.equal(previewIds.includes('faq-metadata.html'), false);
  assert.equal(previewIds.includes('faq-seo-graph.html'), false);
  assert.equal(previewIds.includes('url-alias.blackbox'), false);
  assert(cnIds.includes('faq-metadata.html'));
  assert(cnIds.includes('faq-seo-graph.html'));
});

test('release source checks run content hygiene first and block dirty published Markdown', () => {
  assert.equal(
    packageJson.scripts['verify:content-hygiene'],
    'node scripts/verify-content-hygiene.js --mode source'
  );
  assert.equal(
    packageJson.scripts['verify:content-hygiene-regression'],
    'node --test scripts/verify-content-hygiene.test.js'
  );
  assert.match(
    packageJson.scripts.prebuild,
    /^node scripts\/verify-content-hygiene\.js --mode source && /
  );

  const sourceOrder = getSourceExecutionOrder();
  assert(sourceOrder.indexOf('content-hygiene.source') < sourceOrder.indexOf('typescript.source'));

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-release-hygiene-'));
  const fixtureRoot = path.join(temporaryRoot, 'repo');
  try {
    fs.cpSync(ROOT, fixtureRoot, {
      recursive: true,
      filter: (source) =>
        !['.git', '.next', 'node_modules', 'out', '.release-artifacts'].includes(
          path.basename(source)
        )
    });
    const dirtyPath = path.join(
      fixtureRoot,
      'src/content/guides/temporary-content-hygiene-dirty.md'
    );
    fs.writeFileSync(dirtyPath, '# Temporary fixture\n\nFact Source: internal KB\n');
    const buildInfoPath = path.join(fixtureRoot, 'tsconfig.tsbuildinfo');
    const buildInfoBefore = fs.readFileSync(buildInfoPath);
    const result = spawnSync(process.execPath, ['scripts/verify-release.js', '--source-only'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${path.join(ROOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH}`
      }
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /content hygiene source verification/);
    assert.match(result.stderr, /temporary-content-hygiene-dirty\.md/);
    assert.deepEqual(fs.readFileSync(buildInfoPath), buildInfoBefore);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('contact animations load GSAP only after the client mounts', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/components/contact/ContactPage.tsx'), 'utf8');

  assert.doesNotMatch(
    source,
    /^import .* from ['"](?:@gsap\/react|gsap(?:\/ScrollTrigger)?)['"];$/m
  );
  assert.match(source, /import\('gsap'\)/);
  assert.match(source, /import\('gsap\/ScrollTrigger'\)/);
  assert(source.indexOf('gsapRuntime.registerPlugin') > source.indexOf('useEffect('));
  assert.match(source, /context\?\.revert\(\)/);
});

test('root layout keeps the retired consultation modal out of initial JavaScript', () => {
  const layout = fs.readFileSync(path.join(ROOT, 'src/app/layout.tsx'), 'utf8');

  assert.doesNotMatch(layout, /ConsultationProvider/);
  assert.equal(
    fs.existsSync(path.join(ROOT, 'src/components/contact/ConsultationProvider.tsx')),
    false
  );
});

test('retired consultation modal dependencies and APIs stay removed', () => {
  const consultation = fs.readFileSync(path.join(ROOT, 'src/lib/consultation.ts'), 'utf8');
  const contactForm = fs.readFileSync(
    path.join(ROOT, 'src/components/contact/ContactForm.tsx'),
    'utf8'
  );

  assert.equal(packageJson.dependencies?.['@gsap/react'], undefined);
  assert.equal(packageJson.devDependencies?.['@gsap/react'], undefined);
  assert.equal(packageLock.packages?.['node_modules/@gsap/react'], undefined);
  assert.equal(fs.existsSync(path.join(ROOT, 'src/components/contact/dialogCopy.ts')), false);
  assert.doesNotMatch(consultation, /\bgetLocaleFromPathname\b/);
  assert.doesNotMatch(contactForm, /\bonDone\b/);
});

test('source-only release leaves the existing build info bytes unchanged', () => {
  const buildInfoPath = path.join(ROOT, 'tsconfig.tsbuildinfo');
  const releaseRecordPath = path.join(ROOT, '.release-artifacts', 'release-verification.json');
  const readReleaseRecord = () =>
    fs.existsSync(releaseRecordPath) ? fs.readFileSync(releaseRecordPath) : undefined;
  const before = fs.readFileSync(buildInfoPath);
  const releaseRecordBefore = readReleaseRecord();
  const result = spawnSync(process.execPath, ['scripts/verify-release.js', '--source-only'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(fs.readFileSync(buildInfoPath), before);
  assert.deepEqual(readReleaseRecord(), releaseRecordBefore);
});

test('release build and workflow wiring preserve source hygiene while enforcing completed HTML exports', () => {
  const verificationWorkflow = fs.readFileSync(
    path.join(ROOT, '.github/workflows/guide-release-verification.yml'),
    'utf8'
  );

  assert.equal(
    packageJson.scripts.prebuild.split(' && ')[0],
    'node scripts/verify-content-hygiene.js --mode source'
  );
  assert.equal(
    packageJson.scripts['verify:content-hygiene-html'],
    'node scripts/verify-content-hygiene.js --mode html --root out'
  );
  assert.match(
    packageJson.scripts.build,
    /fix-html-lang\.js && node scripts\/verify-technical-export\.js && node scripts\/verify-content-hygiene\.js --mode html --root out$/
  );
  const variantOrder = getVariantExecutionOrder('cn');
  assert(variantOrder.indexOf('variant.build') < variantOrder.indexOf('content-hygiene.html'));
  assert(getSourceExecutionOrder().includes('typescript.source'));
  for (const pattern of [
    'src/**',
    'content/competitors/**',
    'scripts/verify-content-hygiene.js',
    'scripts/fix-html-lang.js'
  ])
    assert(verificationWorkflow.includes(pattern), pattern);
});

test('successful verified outputs can be retained before lifecycle cleanup', () => {
  assert.equal(typeof retainSuccessArtifacts, 'function');
  assert.deepEqual(parseReleaseArgs(['--retain-success-artifacts', 'tmp/release-output']), {
    sourceOnly: false,
    keepArtifacts: false,
    retainSuccessArtifacts: path.join(ROOT, 'tmp/release-output'),
    variant: undefined
  });
});

test('P1 successful evidence keeps the emitted KiB measurement', () => {
  const output =
    'P1 verification passed for https://fastgpt.io: 259.8 KiB initial JavaScript gzip\n';
  assert.equal(extractP1SuccessMeasurement(output), '259.8 KiB initial JavaScript gzip');
  assert.equal(extractP1SuccessMeasurement('P1 verification passed'), undefined);
});

test('Linux release evidence stays build-only', () => {
  const workflowPath = path.join(ROOT, '.github/workflows/guide-release-verification.yml');
  const dockerfilePath = path.join(ROOT, 'Dockerfile.verify');
  const workflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
  const dockerfile = fs.existsSync(dockerfilePath) ? fs.readFileSync(dockerfilePath, 'utf8') : '';

  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /cache: npm/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run verify:release -- --keep-artifacts/);
  assert.match(workflow, /allow-missing-solutions-evidence/);
  assert.match(workflow, /if: \$\{\{ always\(\)/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /\.release-artifacts/);
  assert.match(workflow, /include-hidden-files: true/);
  assert.match(workflow, /technical-content-release-evidence/);
  assert.match(workflow, /docker build --target runtime/);
  assert.match(workflow, /NEXT_PUBLIC_SITE_VARIANT=cn/);
  for (const pathTrigger of [
    'Dockerfile',
    '.dockerignore',
    'nginx.conf',
    'nginx-security-headers.conf',
    'nginx-embeddable-security-headers.conf'
  ]) {
    assert(workflow.includes(`- '${pathTrigger}'`), pathTrigger);
  }

  assert.match(dockerfile, /^FROM node:24/m);
  assert.match(dockerfile, /COPY package\.json package-lock\.json \.\//);
  assert.match(dockerfile, /RUN npm ci/);
  assert.match(dockerfile, /COPY \. \./);
  assert.match(dockerfile, /RUN npm run verify:release/);
  assert.match(
    dockerfile,
    /docker build --file Dockerfile\.verify --tag fastgpt-guide-release-verify \./
  );

  const executable = [
    ...workflow.split('\n').filter((line) => /^\s*run:|^\s*- run:/.test(line)),
    ...dockerfile.split('\n').filter((line) => /^(RUN|CMD|ENTRYPOINT)\b/.test(line))
  ].join('\n');
  assert.doesNotMatch(
    executable,
    /\b(deploy|curl|rollback|kubectl|docker push|cache purge|revision)\b/i
  );
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts/verify-guide-live.js')), false);
});

test('P1 budget failures remain aggregate failures and add a separate baseline advisory', () => {
  const failures = [
    failure('P1 HTML verification (io)', 'Initial JavaScript is 267.0 KiB gzip, budget is 260 KiB')
  ];
  const original = structuredClone(failures);
  const advisories = [];

  appendP1HistoricalBaselineAdvisories(failures, 0, advisories);

  assert.deepEqual(failures, original);
  assert.equal(advisories.length, 1);
  assert.match(advisories[0].output, /c77cf48/);
  assert.match(advisories[0].output, /266\.9 KiB/);
  assert.match(advisories[0].output, /\+0\.1 KiB/);
  assert.match(advisories[0].output, /260 KiB/);
  assert.equal(advisories[0].command, original[0].command);
  assert.equal(advisories[0].variant, 'io');
});

test('unrelated failures retain order and do not create baseline advisories', () => {
  const failures = [
    failure('P0 HTML verification (io)', 'header mismatch'),
    failure('P2 HTML verification (cn)', 'canonical mismatch', 'cn')
  ];
  const original = structuredClone(failures);
  const advisories = [];

  appendP1HistoricalBaselineAdvisories(failures, 0, advisories);

  assert.deepEqual(failures, original);
  assert.deepEqual(advisories, []);
});

test('owner expectation sets use published owner route keys and source data', () => {
  const io = buildOwnerExpectationSet('io');
  const cn = buildOwnerExpectationSet('cn');

  assert.equal(io.length, 1400);
  assert.equal(cn.length, 1490);
  assert(io.every((record) => record.variant === 'io' && record.routeKey === record.canonicalSlug));
  assert(
    cn.every(
      (record) => record.variant === 'cn' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.routeKey)
    )
  );

  const registry = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src/faq/generated-en-route-registry.json'), 'utf8')
  );
  const registryIds = new Set(registry.records.map((record) => record.contentId));
  const chineseOnly = cn.find((record) => !registryIds.has(record.contentId));
  assert(
    chineseOnly,
    'Expected a Chinese-only published FAQ record absent from the English route registry'
  );
  for (const field of ['Title', 'Description', 'Keywords', 'Question', 'Answers']) {
    assert.equal(
      typeof chineseOnly[field],
      'string',
      `Chinese-only ${field} must come from authored data`
    );
    assert(chineseOnly[field].length > 0, `Chinese-only ${field} must be populated`);
  }
});

const ioExpectations = buildOwnerExpectationSet('io');
const caseInsensitiveFixtureSkip =
  !isCaseSensitiveFilesystem() && hasCaseInsensitiveRouteCollision(ioExpectations);

test(
  'metadata HTML CLI reuses one loaded source context across every io fixture',
  {
    skip:
      caseInsensitiveFixtureSkip &&
      'io route keys require a case-sensitive filesystem; CI runs this regression on a compatible host'
  },
  () => {
    const temporaryDir = fs.mkdtempSync(path.join(path.dirname(ROOT), 'fastgpt-faq-metadata-'));
    const preservedOutDir = path.join(temporaryDir, 'out');
    const readCounterPath = path.join(temporaryDir, 'read-counter.js');
    let preservedOut = false;

    try {
      if (fs.existsSync(OUT_DIR)) {
        fs.renameSync(OUT_DIR, preservedOutDir);
        preservedOut = true;
      }
      fs.mkdirSync(OUT_DIR, { recursive: true });
      for (const record of ioExpectations) writeFaqFixture(record);

      const artifactPath = path.join(ROOT, 'src/faq/generated-en-metadata.json');
      fs.writeFileSync(
        readCounterPath,
        [
          "const fs = require('node:fs');",
          "const path = require('node:path');",
          `const artifactPath = ${JSON.stringify(artifactPath)};`,
          'const readFileSync = fs.readFileSync;',
          'let artifactReads = 0;',
          'fs.readFileSync = function readFileSyncWithCounter(file, ...args) {',
          '  if (path.resolve(String(file)) === artifactPath) artifactReads += 1;',
          '  return readFileSync.call(this, file, ...args);',
          '};',
          "process.on('exit', () => {",
          '  if (artifactReads !== 1) {',
          '    process.stderr.write(`[faq-metadata] expected one approved-artifact read, received ${artifactReads}\\n`);',
          '    process.exitCode = 1;',
          '  }',
          '});'
        ].join('\n')
      );

      const result = spawnSync(
        process.execPath,
        [
          '--require',
          readCounterPath,
          'scripts/verify-faq-metadata.js',
          '--html',
          '--variant',
          'io'
        ],
        { cwd: ROOT, encoding: 'utf8' }
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /io, 1400 FAQ pages/);
    } finally {
      fs.rmSync(OUT_DIR, { recursive: true, force: true });
      if (preservedOut) fs.renameSync(preservedOutDir, OUT_DIR);
      fs.rmSync(temporaryDir, { recursive: true, force: true });
    }
  }
);

test('metadata CLI arguments are explicit and HTML-scoped', () => {
  assert.deepEqual(parseArgs([], { NEXT_PUBLIC_SITE_VARIANT: 'cn' }), {
    html: false,
    variant: undefined
  });
  assert.deepEqual(parseArgs(['--html', '--variant', 'io']), { html: true, variant: 'io' });
  assert.deepEqual(parseArgs(['--html'], { NEXT_PUBLIC_SITE_VARIANT: 'cn' }), {
    html: true,
    variant: 'cn'
  });
  for (const argv of [
    ['--variant', 'io'],
    ['--html', '--variant'],
    ['--html', '--variant', 'fr'],
    ['--unexpected']
  ]) {
    assert.throws(() => parseArgs(argv), /--html|--variant|Unknown argument/);
  }
});

test('requiring the metadata verifier is silent and side-effect free', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', "require('./scripts/verify-faq-metadata.js')"],
    {
      cwd: ROOT,
      encoding: 'utf8'
    }
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
