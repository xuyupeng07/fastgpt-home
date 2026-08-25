const fs = require('node:fs');
const path = require('node:path');
const TECHNICAL_CONTENT_POLICY = require('../../src/lib/technical-content-policy.json');
const { URL_ALIAS_CONTRACT } = require('./url-alias-authority');
const { siteVariants } = require('./site-variant');
const {
  RELEASE_READINESS_SCHEMA_VERSION,
  buildDeterministicReadiness,
  normalizeSolutionsEvidence
} = require('./release-readiness');
const { collectSourceProvenance, redactReleaseOptions } = require('./release-cross-project');

const ROOT = path.resolve(__dirname, '../..');
const RETAIN_DIR = path.join(ROOT, '.release-artifacts');
const EXPECTED_FAQ_COUNTS = { io: 1400, cn: 1490, preview: 1400 };
const EXPECTED_ALIAS_COUNTS = URL_ALIAS_CONTRACT.sourceHosts;
const EXPECTED_CASE_ONLY_COUNTS = URL_ALIAS_CONTRACT.slices['case-only'].sourceHosts;
const EXPECTED_REBUILT_SLUG_COUNTS = URL_ALIAS_CONTRACT.slices['rebuilt-slug'].sourceHosts;
const EXPECTED_TECHNICAL_PAGE_COUNT = TECHNICAL_CONTENT_POLICY.expectedPageCount;
const EXPECTED_TECHNICAL_AUTHORITY = {
  historicalAccepted: 454,
  historicalDenied: 6,
  historicalAdd: 450,
  historicalUpdate: 4,
  historicalPageCount: 1122,
  candidateCount: 888,
  temporary: 0,
  governanceStatus: 'governance-complete',
  publicationCount: 0,
  identityConflicts: 4,
  duplicateRelations: 9,
  resolvedRelations: 9,
  credentialUnresolved: 0,
  operationRiskUnresolved: 0
};
const EXPECTED_TECHNICAL_WAVE = {
  wave: 'wave-1',
  baselinePageCount: 1122,
  selectedCount: 50,
  acceptedAdd: 50,
  acceptedUpdate: 0,
  resultingPageCount: 1172
};
const GUIDE_TRACER_SLUG = 'poc-30-day-design';
const GUIDE_AUTHORIZATION_SLUGS = ['finance-research-retrieval', 'finance-daily-report-automation'];
const GUIDE_ENTRY_COUNT = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/content/guides/policy.json'), 'utf8')
).entryCount;
const GUIDE_RELEASE_PAIRS = [
  { slug: GUIDE_TRACER_SLUG, locales: ['zh', 'en'] },
  { slug: 'database-qa-integration-guide', locales: ['zh', 'en'] },
  { slug: 'scheduled-report-automation', locales: ['zh', 'en'] },
  { slug: 'finance-research-retrieval', locales: ['zh', 'en'] },
  { slug: 'finance-daily-report-automation', locales: ['zh', 'en'] }
];
const FAQ_METADATA_CONTRACT = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/faq/generated-en-metadata-authority.json'), 'utf8')
).counts;
const EXPECTED_FAQ_METADATA_CANDIDATES = FAQ_METADATA_CONTRACT.candidates;
const EXPECTED_FAQ_METADATA_IDENTITIES = FAQ_METADATA_CONTRACT.identities;
const EXPECTED_FAQ_METADATA_BASELINE = FAQ_METADATA_CONTRACT.baseline;
const EXPECTED_FAQ_METADATA_ADDITIONS = FAQ_METADATA_CONTRACT.additions;
const EXPECTED_FAQ_METADATA_FALLBACK_BEFORE = FAQ_METADATA_CONTRACT.fallback.before;
const EXPECTED_FAQ_METADATA_FALLBACK = FAQ_METADATA_CONTRACT.fallback.after;
const RELEASE_RECORD_FILENAME = 'release-verification.json';

function createReleaseRecord(options) {
  const startedAt = new Date().toISOString();
  return {
    schemaVersion: RELEASE_READINESS_SCHEMA_VERSION,
    recordKind: 'week05-release-readiness',
    issue: {
      number: 247,
      url: 'https://github.com/labring/fastgpt-home/issues/247'
    },
    startedAt,
    options: redactReleaseOptions(options),
    sourceProvenance: collectSourceProvenance(startedAt),
    artifacts: [],
    crossProjectInputs: {
      solutionsPreviewHttp: normalizeSolutionsEvidence()
    },
    rollback: {
      inventory: []
    },
    evidenceTiers: {
      'source-verified': { state: 'not-verified', claim: false },
      'export-verified': { state: 'not-verified', claim: false },
      'preview-http': { state: 'not-verified', claim: false },
      'release-eligible': { state: 'blocked', claim: false },
      'production-observed': { state: 'not-observed', claim: false },
      'search-observed': { state: 'not-observed', claim: false }
    },
    commands: [],
    counts: {
      expectedImportedPages: TECHNICAL_CONTENT_POLICY.expectedAcceptedCount,
      expectedDeniedPages: TECHNICAL_CONTENT_POLICY.expectedDeniedCount,
      expectedTechnicalPages: EXPECTED_TECHNICAL_PAGE_COUNT,
      technicalAuthority: { ...EXPECTED_TECHNICAL_AUTHORITY },
      technicalWave: { ...EXPECTED_TECHNICAL_WAVE },
      faqMetadata: {
        candidates: EXPECTED_FAQ_METADATA_CANDIDATES,
        identities: EXPECTED_FAQ_METADATA_IDENTITIES,
        baseline: EXPECTED_FAQ_METADATA_BASELINE,
        additions: EXPECTED_FAQ_METADATA_ADDITIONS,
        fallbackBefore: EXPECTED_FAQ_METADATA_FALLBACK_BEFORE,
        fallback: EXPECTED_FAQ_METADATA_FALLBACK,
        fallbackDelta: EXPECTED_FAQ_METADATA_FALLBACK - EXPECTED_FAQ_METADATA_FALLBACK_BEFORE
      },
      variants: {}
    },
    variants: [],
    evidence: {
      releaseEligible: false,
      exportVerified: [],
      aliasContract: {
        expectedSources: URL_ALIAS_CONTRACT.sources,
        expectedSourceHosts: EXPECTED_ALIAS_COUNTS,
        expectedTargets: URL_ALIAS_CONTRACT.targets,
        expectedManyToOneTargets: URL_ALIAS_CONTRACT.manyToOneTargets,
        source: false,
        regression: false,
        rebuiltSlug: {
          expectedSources: URL_ALIAS_CONTRACT.slices['rebuilt-slug'].sources,
          expectedSourceHosts: EXPECTED_REBUILT_SLUG_COUNTS,
          source: false,
          regression: false
        },
        variants: {},
        artifacts: {}
      },
      publishedTechnicalPages: { status: 'not-verified', claim: false },
      technicalAuthority: {
        expected: { ...EXPECTED_TECHNICAL_AUTHORITY },
        source: false,
        regression: false,
        observed: undefined,
        releaseReady: false
      },
      technicalWave: {
        expected: { ...EXPECTED_TECHNICAL_WAVE },
        source: false,
        regression: false,
        observed: undefined,
        variants: {},
        releaseReady: false
      },
      faqMetadata: {
        expected: {
          candidates: EXPECTED_FAQ_METADATA_CANDIDATES,
          identities: EXPECTED_FAQ_METADATA_IDENTITIES,
          baseline: EXPECTED_FAQ_METADATA_BASELINE,
          additions: EXPECTED_FAQ_METADATA_ADDITIONS,
          fallbackBefore: EXPECTED_FAQ_METADATA_FALLBACK_BEFORE,
          fallback: EXPECTED_FAQ_METADATA_FALLBACK,
          fallbackDelta: EXPECTED_FAQ_METADATA_FALLBACK - EXPECTED_FAQ_METADATA_FALLBACK_BEFORE
        },
        source: false,
        regression: false,
        variants: {},
        releaseReady: false
      },
      caseOnly: {
        expectedSources: 743,
        expectedSourceHosts: EXPECTED_CASE_ONLY_COUNTS,
        source: false,
        regression: false,
        variants: {}
      },
      guidePairs: {
        expected: GUIDE_RELEASE_PAIRS,
        source: false,
        variants: {},
        releaseReady: false
      },
      guideAuthorization: {
        expectedSlugs: GUIDE_AUTHORIZATION_SLUGS,
        source: false,
        regression: false,
        result: undefined,
        releaseReady: false
      }
    },
    blockers: []
  };
}

function collectCountEvidence(record, output) {
  const imported = output.match(/Technical content authority verified: (\d+) imported pages/);
  if (imported) record.counts.importedPages = Number(imported[1]);
}

function collectTechnicalAuthorityEvidence(record, stepId, status, output) {
  const evidenceKey = {
    'technical-authority.source': 'source',
    'technical-authority.regression': 'regression'
  }[stepId];
  if (!record || !evidenceKey) return;
  const evidence = record.evidence.technicalAuthority;
  evidence[evidenceKey] = status === 'passed';
  const marker = output.match(/TECHNICAL_AUTHORITY_RESULT=(\{[^\n]+\})/);
  if (!marker) return;
  try {
    evidence.observed = JSON.parse(marker[1]);
    record.counts.technicalAuthorityObserved = evidence.observed;
  } catch (error) {
    evidence.observed = { status: 'invalid', error: error.message };
  }
}

function collectTechnicalWaveEvidence(record, stepId, variant, status, output) {
  if (
    !record ||
    !['technical-wave.source', 'technical-wave.regression', 'technical-wave.export'].includes(
      stepId
    )
  ) {
    return;
  }
  const evidence = record.evidence.technicalWave;
  if (stepId === 'technical-wave.source') evidence.source = status === 'passed';
  if (stepId === 'technical-wave.regression') evidence.regression = status === 'passed';
  const marker = output.match(/WAVE1_RESULT=(\{[^\n]+\})/);
  if (!marker) return;
  try {
    const observed = JSON.parse(marker[1]);
    evidence.observed = observed;
    record.counts.technicalWaveObserved = observed;
    if (variant) evidence.variants[variant] = observed;
  } catch (error) {
    evidence.observed = { status: 'invalid', error: error.message };
  }
}

function formatTechnicalAuthoritySuccess(output) {
  const marker = output.match(/TECHNICAL_AUTHORITY_RESULT=(\{[^\n]+\})/);
  if (!marker) return undefined;
  const result = JSON.parse(marker[1]);
  return `status=${result.governanceStatus} publication-count=${result.publicationCount} historicalAccepted=${result.historicalAccepted} historicalDenied=${result.historicalDenied} candidates=${result.candidateCount} accepted=${result.accepted} denied=${result.denied} add=${result.add} update=${result.update} resultingPages=${result.resultingPageCount}`;
}

function writeReleaseRecord(record) {
  const recordPath = path.join(RETAIN_DIR, RELEASE_RECORD_FILENAME);
  fs.mkdirSync(RETAIN_DIR, { recursive: true });
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return recordPath;
}

function finalizeReleaseRecord(record, failures, options) {
  record.finishedAt = new Date().toISOString();
  record.failureCount = failures.length;
  record.blockers = failures.map((failure) => ({
    type: failure.id === 'filesystem.case-sensitive' ? 'environment' : 'verification',
    id: failure.id,
    label: failure.label,
    variant: failure.variant,
    command: failure.command,
    detail: failure.output
  }));
  const solutionsPreviewHttp = record.crossProjectInputs.solutionsPreviewHttp;
  record.evidence.solutionsPreviewHttp = solutionsPreviewHttp;
  for (const blocker of solutionsPreviewHttp.blockers || []) {
    record.blockers.push({
      type: 'cross-project',
      label: 'Solutions preview HTTP contract',
      code: blocker.code,
      detail: blocker.detail
    });
  }
  record.blockerCount = record.blockers.length;
  const caseOnly = record.evidence.caseOnly;
  caseOnly.releaseReady =
    caseOnly.source &&
    caseOnly.regression &&
    Object.entries(EXPECTED_CASE_ONLY_COUNTS).every(([host, expected]) => {
      const variant = host === 'fastgpt.cn' ? 'cn' : 'io';
      return (
        caseOnly.variants[variant]?.status === 'passed' &&
        caseOnly.variants[variant]?.aliases === expected
      );
    });
  const aliasContract = record.evidence.aliasContract;
  aliasContract.releaseReady =
    aliasContract.source &&
    aliasContract.regression &&
    aliasContract.rebuiltSlug.source &&
    aliasContract.rebuiltSlug.regression &&
    ['cn', 'io'].every((variant) => aliasContract.artifacts[variant]?.status === 'passed') &&
    ['cn', 'io'].every((variant) => {
      const evidence = aliasContract.variants[variant];
      const expected = EXPECTED_ALIAS_COUNTS[variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io'];
      return evidence?.status === 'passed' && evidence.aliases === expected;
    });
  const faqMetadata = record.evidence.faqMetadata;
  faqMetadata.releaseReady =
    faqMetadata.source &&
    faqMetadata.regression &&
    ['cn', 'io'].every((variant) => faqMetadata.variants[variant]?.status === 'passed') &&
    faqMetadata.variants.io?.staticHtml === 'passed' &&
    Object.entries(faqMetadata.expected).every(([key, expected]) => {
      if (key === 'fallbackDelta') return faqMetadata.observed?.fallbackDelta === expected;
      return faqMetadata.observed?.[key] === expected;
    });
  const guidePairs = record.evidence.guidePairs;
  const guideAuthorization = record.evidence.guideAuthorization;
  const technicalAuthority = record.evidence.technicalAuthority;
  const completeAuthorization = guideAuthorization.result?.complete;
  const missingAuthorization = guideAuthorization.result?.missing;
  guideAuthorization.releaseReady =
    guideAuthorization.source &&
    guideAuthorization.regression &&
    completeAuthorization?.status === 'publishable' &&
    completeAuthorization.projectedEntries === GUIDE_ENTRY_COUNT &&
    completeAuthorization.financeSlugs?.length === GUIDE_AUTHORIZATION_SLUGS.length &&
    missingAuthorization?.status === 'release-blocked' &&
    missingAuthorization.projectedEntries ===
      GUIDE_ENTRY_COUNT - GUIDE_AUTHORIZATION_SLUGS.length &&
    missingAuthorization.financeSlugs?.length === 0 &&
    GUIDE_AUTHORIZATION_SLUGS.every((slug) => missingAuthorization.excludedSlugs?.includes(slug));
  guidePairs.releaseReady =
    guidePairs.source &&
    guideAuthorization.releaseReady &&
    ['cn', 'io', 'preview'].every((variant) => {
      const evidence = guidePairs.variants[variant];
      return (
        evidence?.status === 'passed' &&
        GUIDE_RELEASE_PAIRS.every((pair) => evidence.pairs[pair.slug]?.releaseEligible)
      );
    });
  technicalAuthority.releaseReady =
    technicalAuthority.source &&
    technicalAuthority.regression &&
    Object.entries(technicalAuthority.expected).every(
      ([key, expected]) => technicalAuthority.observed?.[key] === expected
    ) &&
    technicalAuthority.observed?.resultingPageCount ===
      technicalAuthority.observed?.historicalPageCount + technicalAuthority.observed?.add;
  const technicalWave = record.evidence.technicalWave;
  technicalWave.releaseReady =
    technicalWave.source &&
    technicalWave.regression &&
    Object.entries(technicalWave.expected).every(
      ([key, expected]) => technicalWave.observed?.[key] === expected
    ) &&
    ['cn', 'io', 'preview'].every((variant) => {
      const observed = technicalWave.variants[variant];
      return (
        observed?.sourceVerified === true &&
        observed?.exportVerified === true &&
        observed?.releaseEligible === true
      );
    });
  const releaseGate = !options.sourceOnly && !options.variant && failures.length === 0;
  record.evidence.releaseEligible =
    releaseGate &&
    solutionsPreviewHttp.claim === true &&
    caseOnly.releaseReady &&
    aliasContract.releaseReady &&
    faqMetadata.releaseReady &&
    technicalAuthority.releaseReady &&
    technicalWave.releaseReady &&
    guideAuthorization.releaseReady &&
    guidePairs.releaseReady;
  record.status = record.evidence.releaseEligible
    ? 'release-eligible'
    : record.blockers.some((blocker) => blocker.type === 'environment')
    ? 'environment-blocked'
    : failures.length
    ? 'failed'
    : !options.sourceOnly && solutionsPreviewHttp.claim !== true
    ? 'release-blocked'
    : options.sourceOnly
    ? 'source-verified'
    : 'export-verified';
  record.evidence.exportVerified = record.variants
    .filter((variant) => variant.outcome === 'export-verified')
    .map((variant) => variant.variant);
  const sourceFailure = failures.some(
    (failure) =>
      !failure.variant &&
      failure.id !== 'filesystem.case-sensitive' &&
      failure.id !== 'solutions-preview.http'
  );
  const exportClaim =
    !options.sourceOnly &&
    !options.variant &&
    record.variants.length === siteVariants.length &&
    record.variants.every((variant) => variant.outcome === 'export-verified');
  record.evidenceTiers = {
    'source-verified': { state: sourceFailure ? 'blocked' : 'verified', claim: !sourceFailure },
    'export-verified': { state: exportClaim ? 'verified' : 'not-verified', claim: exportClaim },
    'preview-http': {
      state: solutionsPreviewHttp.claim === true ? 'verified' : 'blocked',
      claim: solutionsPreviewHttp.claim === true
    },
    'release-eligible': {
      state: record.evidence.releaseEligible ? 'eligible' : 'blocked',
      claim: record.evidence.releaseEligible
    },
    'production-observed': { state: 'not-observed', claim: false },
    'search-observed': { state: 'not-observed', claim: false }
  };
  record.evidence.tiers = record.evidenceTiers;
  record.releaseReadiness = buildDeterministicReadiness(record);
  return record;
}

function recordStep(record, stepId, label, command, variant, status, output, evidence) {
  if (!record) return;
  const step = { id: stepId, label, variant, command, status };
  if (evidence) step.evidence = evidence;
  step.output = output.trim().slice(status === 'failed' ? -4000 : -1200) || '<no command output>';
  record.commands.push(step);
  collectCountEvidence(record, output);
  collectTechnicalAuthorityEvidence(record, stepId, status, output);
  collectTechnicalWaveEvidence(record, stepId, variant, status, output);
  collectCaseOnlyEvidence(record, stepId, variant, status, output);
  collectAliasContractEvidence(record, stepId, variant, status, output);
  collectFaqMetadataEvidence(record, stepId, variant, status, output);
  collectGuideAuthorizationEvidence(record, stepId, status, output);
  collectGuidePairEvidence(record, stepId, variant, status, output);
}

function collectGuideAuthorizationEvidence(record, stepId, status, output) {
  const evidenceKey = {
    'guide-authorization.source': 'source',
    'guide-authorization.regression': 'regression'
  }[stepId];
  if (!record || !evidenceKey) return;
  const evidence = record.evidence.guideAuthorization;
  evidence[evidenceKey] = status === 'passed';
  const marker = output.match(/GUIDE_AUTHORIZATION_RESULT=(\{[\s\S]*\})/);
  if (!marker) return;
  try {
    evidence.result = JSON.parse(marker[1]);
  } catch (error) {
    evidence.result = { status: 'invalid', error: error.message };
  }
}

function collectGuidePairEvidence(record, stepId, variant, status, output) {
  if (!record || !['guide-content.source', 'guide.export'].includes(stepId)) return;
  const guidePairs = record.evidence.guidePairs;
  if (stepId === 'guide-content.source') {
    const match = output.match(/Guide content verified: (\d+) slugs, (\d+) documents/);
    guidePairs.source = status === 'passed';
    guidePairs.sourceCounts = match
      ? { slugs: Number(match[1]), documents: Number(match[2]) }
      : undefined;
  }
  if (!variant || stepId !== 'guide.export') return;
  const match = output.match(/Guide HTML verified: (\d+) pages, (\d+) sitemap URLs/);
  const previewMatch = output.match(
    /Guide Preview HTML verified: (\d+) pages, (\d+) bilingual pairs/
  );
  const artifactStatus = output.includes('skipped') ? 'skipped' : status;
  guidePairs.variants[variant] = {
    status: artifactStatus,
    pages: match ? Number(match[1]) : previewMatch ? Number(previewMatch[1]) : undefined,
    sitemapUrls: match ? Number(match[2]) : undefined,
    bilingualPairs: previewMatch ? Number(previewMatch[2]) : undefined,
    pairs: Object.fromEntries(
      GUIDE_RELEASE_PAIRS.map((pair) => [
        pair.slug,
        {
          locales: pair.locales,
          releaseEligible: artifactStatus === 'passed'
        }
      ])
    )
  };
}

function collectCaseOnlyEvidence(record, stepId, variant, status, output) {
  if (!record || !['case-only.source', 'case-only.regression', 'case-only.http'].includes(stepId)) {
    return;
  }
  const aliases = output.match(/aliases=(\d+)/)?.[1];
  const caseOnly = record.evidence.caseOnly;
  if (stepId === 'case-only.source') caseOnly.source = status === 'passed';
  if (stepId === 'case-only.regression') caseOnly.regression = status === 'passed';
  if (variant) {
    caseOnly.variants[variant] = {
      status,
      aliases: aliases ? Number(aliases) : undefined,
      expectedAliases: EXPECTED_CASE_ONLY_COUNTS[variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io']
    };
  }
}

function collectAliasContractEvidence(record, stepId, variant, status, output) {
  if (!record || !stepId.startsWith('url-alias.')) return;
  const aliases = output.match(/aliases=(\d+)/)?.[1];
  const aliasContract = record.evidence.aliasContract;
  if (stepId === 'url-alias.source') aliasContract.source = status === 'passed';
  if (stepId === 'url-alias.regression') aliasContract.regression = status === 'passed';
  if (stepId === 'url-alias.rebuilt-source') aliasContract.rebuiltSlug.source = status === 'passed';
  if (stepId === 'url-alias.rebuilt-regression')
    aliasContract.rebuiltSlug.regression = status === 'passed';
  if (variant && stepId === 'url-alias.blackbox') {
    aliasContract.variants[variant] = {
      status,
      aliases: aliases ? Number(aliases) : undefined,
      expectedAliases: EXPECTED_ALIAS_COUNTS[variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io']
    };
  }
}

function collectFaqMetadataEvidence(record, stepId, variant, status, output) {
  if (
    !record ||
    !['faq-metadata.source', 'faq-metadata.regression', 'faq-metadata.html'].includes(stepId)
  ) {
    return;
  }
  const match = output.match(
    /candidates=(\d+) identities=(\d+) baseline=(\d+) additions=(\d+) fallbackBefore=(\d+) fallback=(\d+) delta=([+-]?\d+)/
  );
  const evidence = record.evidence.faqMetadata;
  if (stepId === 'faq-metadata.source') evidence.source = status === 'passed';
  if (stepId === 'faq-metadata.regression') evidence.regression = status === 'passed';
  if (match) {
    evidence.observed = {
      candidates: Number(match[1]),
      identities: Number(match[2]),
      baseline: Number(match[3]),
      additions: Number(match[4]),
      fallbackBefore: Number(match[5]),
      fallback: Number(match[6]),
      fallbackDelta: Number(match[7])
    };
  }
  if (variant) {
    evidence.variants[variant] = {
      status,
      staticHtml: output.match(/staticHtml=([^\s]+)/)?.[1],
      ...(evidence.observed || {})
    };
  }
}

function recordVariantOutcome(record, variant, failures, commandStart) {
  if (!record) return;
  const commands = record.commands.slice(commandStart);
  const findStep = (stepId) => commands.find((step) => step.id === stepId);
  const technicalExportStep = findStep('technical-export.export');
  const technicalCenterStep = findStep('technical-center.export');
  const guideStep = findStep('guide.export');
  const p1Step = findStep('p1.export');
  const faqMetadataStep = findStep('faq-metadata.html');
  const exportedCount = technicalExportStep?.output.match(
    /Export-verified Technical Pages: (\d+) \(/
  );
  const centerMeasurement = technicalCenterStep?.output.match(
    /(?:passed: .*?, )?(\d+) server entries, ([0-9.]+) KiB initial JavaScript gzip/
  );
  const p1Measurement = p1Step?.output.match(
    /P1 verification passed for .*?:\s*([0-9.]+ KiB initial JavaScript gzip)/
  );
  const guideMeasurement = guideStep?.output.match(
    /Guide (?:Preview )?HTML verified: (\d+) pages, (?:(\d+) sitemap URLs|(?:\d+) bilingual pairs) \(tracer=([^)]+)\)/
  );
  const caseOnlyStep = findStep('case-only.http');
  const aliasStep = findStep('url-alias.blackbox');
  const variantCounts = {
    faqPages: EXPECTED_FAQ_COUNTS[variant],
    technicalPages: exportedCount ? Number(exportedCount[1]) : EXPECTED_TECHNICAL_PAGE_COUNT,
    ...(centerMeasurement
      ? {
          technicalCenterServerEntries: Number(centerMeasurement[1]),
          technicalCenterInitialJavaScriptGzipKiB: Number(centerMeasurement[2])
        }
      : {}),
    ...(p1Measurement ? { initialJavaScriptGzip: p1Measurement[1] } : {}),
    faqMetadata: record.evidence.faqMetadata.variants[variant] || {
      status: faqMetadataStep?.status || 'skipped'
    }
  };
  const artifactStatus = (step) => {
    if (!step) return 'skipped';
    return step.output.includes('skipped') ? 'skipped' : step.status;
  };
  record.variants.push({
    variant,
    outcome:
      !failures.some((failure) => failure.variant === variant) &&
      technicalExportStep?.status === 'passed'
        ? 'export-verified'
        : 'failed',
    technicalCenter: technicalCenterStep?.output.includes('skipped')
      ? 'skipped'
      : technicalCenterStep?.status === 'passed'
      ? 'passed'
      : 'failed',
    technicalExport: technicalExportStep?.status === 'passed',
    technicalPageCount: EXPECTED_TECHNICAL_PAGE_COUNT,
    caseOnly: {
      status: caseOnlyStep?.status || 'skipped',
      aliases: caseOnlyStep?.output.match(/aliases=(\d+)/)?.[1]
        ? Number(caseOnlyStep.output.match(/aliases=(\d+)/)[1])
        : undefined,
      expectedAliases: EXPECTED_CASE_ONLY_COUNTS[variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io']
    },
    aliasContract: {
      status: aliasStep?.status || 'skipped',
      aliases: aliasStep?.output.match(/aliases=(\d+)/)?.[1]
        ? Number(aliasStep.output.match(/aliases=(\d+)/)[1])
        : undefined,
      expectedAliases: EXPECTED_ALIAS_COUNTS[variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io']
    },
    counts: variantCounts,
    artifacts: {
      build: artifactStatus(findStep('variant.build')),
      htmlHygiene: artifactStatus(findStep('content-hygiene.html')),
      technicalCenter: artifactStatus(technicalCenterStep),
      technicalExport: artifactStatus(technicalExportStep),
      faqMetadata: artifactStatus(faqMetadataStep),
      guide: artifactStatus(guideStep),
      guideTracer: {
        status: artifactStatus(guideStep),
        slug:
          guideMeasurement?.[3] ||
          (guideStep?.output.includes('skipped') ? 'skipped' : 'not-reported'),
        expectedSlug: GUIDE_TRACER_SLUG,
        pages: guideMeasurement ? Number(guideMeasurement[1]) : undefined,
        sitemapUrls: guideMeasurement?.[2] ? Number(guideMeasurement[2]) : undefined,
        bilingualPairs: guideStep?.output.match(/(\d+) bilingual pairs/)?.[1]
          ? Number(guideStep.output.match(/(\d+) bilingual pairs/)[1])
          : undefined
      },
      guidePairs: record.evidence.guidePairs.variants[variant] || {
        status: artifactStatus(guideStep),
        pairs: Object.fromEntries(
          GUIDE_RELEASE_PAIRS.map((pair) => [
            pair.slug,
            { locales: pair.locales, releaseEligible: artifactStatus(guideStep) === 'passed' }
          ])
        )
      }
    }
  });
  record.counts.variants = Object.fromEntries(
    record.variants.map((entry) => [entry.variant, entry.counts])
  );
}

module.exports = {
  EXPECTED_FAQ_COUNTS,
  createReleaseRecord,
  finalizeReleaseRecord,
  formatTechnicalAuthoritySuccess,
  recordStep,
  recordVariantOutcome,
  writeReleaseRecord
};
