#!/usr/bin/env node

/**
 * Build and verify the Week05 FAQ candidate-to-identity authority.
 *
 * The workbook is an immutable provenance input. Committed authority and the
 * one-record addition are the build-time projections used by source gates.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  authoredDigests,
  loadRouteIdentity,
  normalizeFaqMetadataPolicy,
  readEnglishFaq,
  readWorkbookSheets
} = require('./generate-faq-metadata');

const ROOT = path.resolve(__dirname, '..');
const AUTHORITY_PATH = path.join(ROOT, 'src/faq/generated-en-metadata-authority.json');
const BASELINE_PATH = path.join(ROOT, 'src/faq/generated-en-metadata.json');
const ADDITIONS_PATH = path.join(ROOT, 'src/faq/generated-en-metadata-additions.json');
const WEEK05_SHEET = '全量可导入-1407条';
const EXPECTED_CANDIDATE_COUNT = 1407;
const EXPECTED_IDENTITY_COUNT = 1400;
const EXPECTED_BASELINE_COUNT = 1195;
const EXPECTED_INCREMENT_COUNT = 205;
const EXPECTED_ADDITION_COUNT = 205;
const EXPECTED_FALLBACK_BEFORE = 205;
const EXPECTED_FALLBACK_AFTER = 0;

const SPECIAL_DISPOSITIONS = Object.freeze({
  149: {
    disposition: 'semantic-remap',
    identityRule: 'approved-target-content-id',
    targetContentId: 'how-ai-platforms-improve-corporate-training',
    reason: 'Corporate-training candidate was published under the customer-experience source slug.'
  },
  1628: {
    disposition: 'no-page',
    identityRule: 'no-published-identity',
    reason: 'The online probe found no page for this candidate.'
  },
  785: {
    disposition: 'duplicate-loser',
    identityRule: 'winner-content-id',
    targetBusinessNo: 728,
    reason: 'Retain the existing W4 metadata authority.'
  },
  832: {
    disposition: 'duplicate-loser',
    identityRule: 'winner-content-id',
    targetBusinessNo: 980,
    reason: 'Retain the complete prompt-engineering title.'
  },
  993: {
    disposition: 'duplicate-loser',
    identityRule: 'winner-content-id',
    targetBusinessNo: 894,
    reason: 'Retain the existing W4 metadata authority.'
  },
  1194: {
    disposition: 'duplicate-loser',
    identityRule: 'winner-content-id',
    targetBusinessNo: 1171,
    reason: 'The competing description ends with an incomplete conjunction.'
  },
  1373: {
    disposition: 'duplicate-loser',
    identityRule: 'winner-content-id',
    targetBusinessNo: 1202,
    reason: 'Retain the existing W4 metadata authority.'
  },
  1797: {
    disposition: 'duplicate-loser',
    identityRule: 'winner-content-id',
    targetBusinessNo: 1665,
    reason: 'Retain the selected maintainability metadata authority.'
  }
});

const IDENTITY_RULES = Object.freeze({
  accepted: 'route-source-slug',
  'semantic-remap': 'approved-target-content-id',
  'duplicate-loser': 'winner-content-id',
  'no-page': 'no-published-identity'
});

function fail(message) {
  throw new Error(`[faq-metadata-authority] ${message}`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Unable to read ${path.relative(ROOT, filePath)}: ${error.message}`);
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function metadataDigest(record) {
  return sha256(
    stableJson({
      contentId: record.contentId,
      sourceSlug: record.sourceSlug,
      title: record.title,
      description: record.description,
      keywords: record.keywords,
      authoredDigests: record.authoredDigests
    })
  );
}

function candidateDigest(candidate) {
  return sha256(
    stableJson({
      sourceSlug: candidate.sourceSlug,
      question: candidate.question,
      title: candidate.title,
      description: candidate.description,
      keywords: candidate.keywords
    })
  );
}

function parseCandidateUrl(value, worksheetRow) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`worksheet row ${worksheetRow} has an invalid online URL: ${value}`);
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'fastgpt.io' || parsed.port) {
    fail(`worksheet row ${worksheetRow} must use an https fastgpt.io URL: ${value}`);
  }
  if (parsed.search || parsed.hash) {
    fail(`worksheet row ${worksheetRow} URL must not contain query/hash values: ${value}`);
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[0] !== 'faq') {
    fail(`worksheet row ${worksheetRow} must target /faq/<slug>: ${value}`);
  }
  let sourceSlug;
  try {
    sourceSlug = decodeURIComponent(parts[1]);
  } catch {
    fail(`worksheet row ${worksheetRow} has an invalid encoded slug: ${value}`);
  }
  if (!sourceSlug || sourceSlug.includes('/')) {
    fail(`worksheet row ${worksheetRow} has an unsafe source slug: ${sourceSlug}`);
  }
  return sourceSlug;
}

function parseWeek05Candidates(workbookPath) {
  const sheets = readWorkbookSheets(workbookPath);
  const rows = sheets[WEEK05_SHEET];
  if (!rows?.length) fail(`Workbook is missing the ${WEEK05_SHEET} sheet`);
  const candidates = rows.slice(1).map((row, index) => {
    const worksheetRow = index + 2;
    const value = (column) =>
      typeof row[column] === 'string' ? row[column] : String(row[column] ?? '');
    const businessNo = Number(value('A'));
    if (!Number.isInteger(businessNo) || businessNo < 1) {
      fail(`worksheet row ${worksheetRow} has an invalid business number: ${value('A')}`);
    }
    const candidate = {
      worksheetRow,
      businessNo,
      sourceSlug: parseCandidateUrl(value('G'), worksheetRow),
      question: value('C'),
      title: value('D'),
      description: value('E'),
      keywords: value('F')
    };
    if (!candidate.question || !candidate.title || !candidate.description || !candidate.keywords) {
      fail(`worksheet row ${worksheetRow} is missing a metadata field`);
    }
    return candidate;
  });
  if (candidates.length !== EXPECTED_CANDIDATE_COUNT) {
    fail(`Expected ${EXPECTED_CANDIDATE_COUNT} candidates, found ${candidates.length}`);
  }
  return candidates;
}

function sourceDigest(candidates) {
  return sha256(
    stableJson(
      candidates.map(
        ({ worksheetRow, businessNo, sourceSlug, question, title, description, keywords }) => ({
          worksheetRow,
          businessNo,
          sourceSlug,
          question,
          title,
          description,
          keywords
        })
      )
    )
  );
}

function buildDispositionRecords(candidates, routeIdentity) {
  const byBusinessNo = new Map(candidates.map((candidate) => [candidate.businessNo, candidate]));
  const records = candidates.map((candidate) => {
    const special = SPECIAL_DISPOSITIONS[candidate.businessNo];
    const routeContentId = routeIdentity.bySourceSlug.get(candidate.sourceSlug);
    const route = routeContentId ? routeIdentity.byContentId.get(routeContentId) : undefined;
    if (!special && !route)
      fail(
        `business ${candidate.businessNo} references unknown source slug ${candidate.sourceSlug}`
      );

    if (special?.disposition === 'semantic-remap') {
      const target = routeIdentity.byContentId.get(special.targetContentId);
      if (!target) fail(`semantic remap target is unpublished: ${special.targetContentId}`);
      return {
        worksheetRow: candidate.worksheetRow,
        businessNo: candidate.businessNo,
        sourceSlug: candidate.sourceSlug,
        disposition: special.disposition,
        identityRule: special.identityRule,
        contentId: special.targetContentId,
        canonicalSlug: target.canonicalSlug,
        candidateDigest: candidateDigest(candidate),
        reason: special.reason
      };
    }

    if (special?.disposition === 'no-page') {
      return {
        worksheetRow: candidate.worksheetRow,
        businessNo: candidate.businessNo,
        sourceSlug: candidate.sourceSlug,
        disposition: special.disposition,
        identityRule: special.identityRule,
        contentId: null,
        canonicalSlug: null,
        candidateDigest: candidateDigest(candidate),
        reason: special.reason
      };
    }

    if (special?.disposition === 'duplicate-loser') {
      const winner = byBusinessNo.get(special.targetBusinessNo);
      if (!winner) fail(`duplicate winner business ${special.targetBusinessNo} is missing`);
      const winnerContentId = routeIdentity.bySourceSlug.get(winner.sourceSlug);
      const winnerRoute = winnerContentId
        ? routeIdentity.byContentId.get(winnerContentId)
        : undefined;
      if (!winnerRoute) fail(`duplicate winner source slug is unpublished: ${winner.sourceSlug}`);
      return {
        worksheetRow: candidate.worksheetRow,
        businessNo: candidate.businessNo,
        sourceSlug: candidate.sourceSlug,
        disposition: special.disposition,
        identityRule: special.identityRule,
        contentId: null,
        canonicalSlug: null,
        mergedInto: winnerRoute.contentId,
        candidateDigest: candidateDigest(candidate),
        reason: special.reason
      };
    }

    return {
      worksheetRow: candidate.worksheetRow,
      businessNo: candidate.businessNo,
      sourceSlug: candidate.sourceSlug,
      disposition: 'accepted',
      identityRule: IDENTITY_RULES.accepted,
      contentId: route.contentId,
      canonicalSlug: route.canonicalSlug,
      candidateDigest: candidateDigest(candidate),
      reason: 'Approved source identity.'
    };
  });

  return records;
}

function buildBaselineDigests(baseline) {
  if (
    !baseline ||
    !Array.isArray(baseline.records) ||
    baseline.records.length !== EXPECTED_BASELINE_COUNT
  ) {
    fail(`Baseline metadata must contain ${EXPECTED_BASELINE_COUNT} records`);
  }
  const digests = {};
  for (const record of baseline.records) {
    if (digests[record.contentId]) fail(`Baseline metadata repeats ${record.contentId}`);
    digests[record.contentId] = metadataDigest(record);
  }
  return Object.fromEntries(
    Object.entries(digests).sort(([left], [right]) => left.localeCompare(right))
  );
}

function buildAddition(candidate, route, authored) {
  const addition = {
    contentId: route.contentId,
    sourceSlug: route.canonicalSlug,
    workbookRow: candidate.worksheetRow,
    title: candidate.title,
    description: candidate.description,
    keywords: candidate.keywords,
    authoredDigests: authoredDigests(authored)
  };
  const normalized = normalizeFaqMetadataPolicy(addition);
  if (!normalized.title || !normalized.description)
    fail(`Addition ${addition.contentId} did not normalize to metadata`);
  return addition;
}

function buildAuthority(workbookPath) {
  const candidates = parseWeek05Candidates(workbookPath);
  const faqRecords = readEnglishFaq();
  const routeIdentity = loadRouteIdentity();
  const dispositions = buildDispositionRecords(candidates, routeIdentity);
  const byBusinessNo = new Map(candidates.map((candidate) => [candidate.businessNo, candidate]));
  const faqById = new Map(faqRecords.map((record) => [record.contentId, record]));
  const baseline = readJson(BASELINE_PATH);
  const baselineDigests = buildBaselineDigests(baseline);
  const baselineIds = new Set(Object.keys(baselineDigests));
  const additionCandidates = candidates.filter((candidate) => {
    const contentId = routeIdentity.bySourceSlug.get(candidate.sourceSlug);
    return contentId && !baselineIds.has(contentId) && !SPECIAL_DISPOSITIONS[candidate.businessNo];
  });
  if (additionCandidates.length !== EXPECTED_ADDITION_COUNT) {
    fail(
      `Expected ${EXPECTED_ADDITION_COUNT} deterministic metadata additions, found ${additionCandidates.length}`
    );
  }
  const additions = additionCandidates.map((candidate) => {
    const contentId = routeIdentity.bySourceSlug.get(candidate.sourceSlug);
    const route = routeIdentity.byContentId.get(contentId);
    const authored = faqById.get(contentId);
    if (!authored) fail(`Addition content is missing from FAQ source: ${contentId}`);
    return buildAddition(candidate, route, authored);
  });
  const dispositionCounts = Object.fromEntries(
    ['accepted', 'semantic-remap', 'duplicate-loser', 'no-page'].map((disposition) => [
      disposition,
      dispositions.filter((record) => record.disposition === disposition).length
    ])
  );
  const identityIds = new Set(dispositions.map((record) => record.contentId).filter(Boolean));
  const routeIds = new Set(routeIdentity.byContentId.keys());
  if (identityIds.size !== EXPECTED_IDENTITY_COUNT)
    fail(`Expected ${EXPECTED_IDENTITY_COUNT} normalized identities, found ${identityIds.size}`);
  if (stableJson([...identityIds].sort()) !== stableJson([...routeIds].sort())) {
    fail('Normalized identities do not match the route registry identity set');
  }

  const authority = {
    version: 1,
    source: {
      workbook: path.basename(workbookPath),
      sheet: WEEK05_SHEET,
      dataRows: EXPECTED_CANDIDATE_COUNT,
      workbookSha256: sha256File(workbookPath),
      normalizedSha256: sourceDigest(candidates),
      dispositionSha256: sha256(stableJson(dispositions))
    },
    identityRules: IDENTITY_RULES,
    counts: {
      candidates: EXPECTED_CANDIDATE_COUNT,
      identities: EXPECTED_IDENTITY_COUNT,
      baseline: EXPECTED_BASELINE_COUNT,
      increment: EXPECTED_INCREMENT_COUNT,
      additions: EXPECTED_ADDITION_COUNT,
      mapped: EXPECTED_BASELINE_COUNT + EXPECTED_ADDITION_COUNT,
      fallback: {
        before: EXPECTED_FALLBACK_BEFORE,
        after: EXPECTED_FALLBACK_AFTER,
        delta: EXPECTED_FALLBACK_AFTER - EXPECTED_FALLBACK_BEFORE
      },
      dispositions: dispositionCounts
    },
    baseline: {
      artifact: path.basename(BASELINE_PATH),
      recordCount: EXPECTED_BASELINE_COUNT,
      normalizedDigests: baselineDigests
    },
    additions,
    records: dispositions
  };
  validateAuthority(authority, { faqRecords, routeIdentity, baseline, additions });
  return { authority, additions };
}

function validateAuthority(authority, { faqRecords, routeIdentity, baseline, additions }) {
  if (!authority || authority.version !== 1) fail('Authority version must be 1');
  if (
    !authority.source ||
    authority.source.sheet !== WEEK05_SHEET ||
    authority.source.dataRows !== EXPECTED_CANDIDATE_COUNT ||
    !/^[a-f0-9]{64}$/.test(authority.source.workbookSha256) ||
    !/^[a-f0-9]{64}$/.test(authority.source.normalizedSha256) ||
    !/^[a-f0-9]{64}$/.test(authority.source.dispositionSha256)
  )
    fail('Authority source provenance or checksum is invalid');
  if (!Array.isArray(authority.records) || authority.records.length !== EXPECTED_CANDIDATE_COUNT) {
    fail(`Authority must contain ${EXPECTED_CANDIDATE_COUNT} candidate dispositions`);
  }
  if (stableJson(authority.identityRules) !== stableJson(IDENTITY_RULES))
    fail('Identity rules drifted');
  const expectedDispositionCounts = {
    accepted: 0,
    'semantic-remap': 0,
    'duplicate-loser': 0,
    'no-page': 0
  };
  const seenRows = new Set();
  const seenBusinessNumbers = new Set();
  const identityIds = new Set();
  const routeIds = new Set(routeIdentity.byContentId.keys());
  let previousWorksheetRow = 1;
  for (const record of authority.records) {
    if (
      !record ||
      !Number.isInteger(record.worksheetRow) ||
      record.worksheetRow < 2 ||
      record.worksheetRow <= previousWorksheetRow ||
      !Number.isInteger(record.businessNo) ||
      record.businessNo < 1 ||
      typeof record.sourceSlug !== 'string' ||
      !record.sourceSlug
    )
      fail('Candidate has an invalid worksheet row');
    previousWorksheetRow = record.worksheetRow;
    if (seenRows.has(record.worksheetRow))
      fail(`Candidate repeats worksheet row ${record.worksheetRow}`);
    if (seenBusinessNumbers.has(record.businessNo))
      fail(`Candidate repeats business number ${record.businessNo}`);
    seenRows.add(record.worksheetRow);
    seenBusinessNumbers.add(record.businessNo);
    if (!(record.disposition in expectedDispositionCounts))
      fail(`Unsupported disposition at business ${record.businessNo}`);
    expectedDispositionCounts[record.disposition] += 1;
    if (record.identityRule !== authority.identityRules[record.disposition]) {
      fail(`Identity rule drift for business ${record.businessNo}`);
    }
    if (!/^[a-f0-9]{64}$/.test(record.candidateDigest))
      fail(`Candidate digest is invalid for business ${record.businessNo}`);
    if (record.disposition === 'accepted') {
      const routeContentId = routeIdentity.bySourceSlug.get(record.sourceSlug);
      const route = routeContentId ? routeIdentity.byContentId.get(routeContentId) : undefined;
      if (
        !route ||
        route.contentId !== record.contentId ||
        route.canonicalSlug !== record.canonicalSlug
      ) {
        fail(`Accepted candidate identity drift for business ${record.businessNo}`);
      }
      identityIds.add(record.contentId);
    } else if (record.disposition === 'semantic-remap') {
      const target = routeIdentity.byContentId.get(record.contentId);
      if (
        !target ||
        record.sourceSlug === target.canonicalSlug ||
        target.canonicalSlug !== record.canonicalSlug
      ) {
        fail(`Semantic remap target drift for business ${record.businessNo}`);
      }
      identityIds.add(record.contentId);
    } else if (record.disposition === 'duplicate-loser') {
      if (record.contentId !== null || record.canonicalSlug !== null || !record.mergedInto) {
        fail(`Duplicate loser generated an identity for business ${record.businessNo}`);
      }
      if (!routeIds.has(record.mergedInto))
        fail(`Duplicate loser merged into unknown identity ${record.mergedInto}`);
    } else if (record.contentId !== null || record.canonicalSlug !== null) {
      fail(`No-page candidate generated an identity for business ${record.businessNo}`);
    }
  }
  if (stableJson(expectedDispositionCounts) !== stableJson(authority.counts.dispositions))
    fail('Disposition counts drifted');
  if (sha256(stableJson(authority.records)) !== authority.source.dispositionSha256) {
    fail('Candidate disposition checksum drifted');
  }
  for (const [businessNo, special] of Object.entries(SPECIAL_DISPOSITIONS)) {
    const record = authority.records.find(
      (candidate) => candidate.businessNo === Number(businessNo)
    );
    if (!record || record.disposition !== special.disposition) {
      fail('Special disposition drift for business ' + businessNo);
    }
    if (special.targetContentId && record.contentId !== special.targetContentId) {
      fail('Special target drift for business ' + businessNo);
    }
    if (special.targetBusinessNo) {
      const winner = authority.records.find(
        (candidate) => candidate.businessNo === special.targetBusinessNo
      );
      if (!winner || record.mergedInto !== winner.contentId) {
        fail('Special merge target drift for business ' + businessNo);
      }
    }
  }
  if (identityIds.size !== EXPECTED_IDENTITY_COUNT) fail(`Identity count is ${identityIds.size}`);
  if (stableJson([...identityIds].sort()) !== stableJson([...routeIds].sort()))
    fail('Identity set does not equal the route registry');

  const baselineDigests = authority.baseline?.normalizedDigests;
  if (!baselineDigests || Object.keys(baselineDigests).length !== EXPECTED_BASELINE_COUNT) {
    fail(`Baseline digest map must contain ${EXPECTED_BASELINE_COUNT} records`);
  }
  for (const record of baseline.records) {
    const expectedDigest = baselineDigests[record.contentId];
    if (!expectedDigest || expectedDigest !== metadataDigest(record))
      fail(`Baseline digest drift for ${record.contentId}`);
  }
  if (!Array.isArray(additions) || additions.length !== EXPECTED_ADDITION_COUNT)
    fail(`Addition count must be ${EXPECTED_ADDITION_COUNT}`);
  const baselineIds = new Set(baseline.records.map((record) => record.contentId));
  const additionIds = new Set();
  for (const addition of additions) {
    if (additionIds.has(addition.contentId) || baselineIds.has(addition.contentId))
      fail(`Addition identity collides: ${addition.contentId}`);
    additionIds.add(addition.contentId);
    if (
      typeof addition.title !== 'string' ||
      !addition.title.trim() ||
      typeof addition.description !== 'string' ||
      !addition.description.trim() ||
      typeof addition.keywords !== 'string' ||
      !addition.keywords.trim()
    ) {
      fail('Addition metadata fields are incomplete for ' + addition.contentId);
    }
    const normalized = normalizeFaqMetadataPolicy(addition);
    if (
      normalized.title !== addition.title + ' - FastGPT' ||
      normalized.description !== addition.description ||
      /(?:[-|｜]\s*)?FastGPT\s*$/i.test(addition.title)
    ) {
      fail('Addition metadata normalization drift for ' + addition.contentId);
    }
    if (routeIdentity.byContentId.get(addition.contentId)?.canonicalSlug !== addition.sourceSlug) {
      fail(`Addition route identity drift for ${addition.contentId}`);
    }
    const authored = faqRecords.find((record) => record.contentId === addition.contentId);
    if (
      !authored ||
      stableJson(addition.authoredDigests) !== stableJson(authoredDigests(authored))
    ) {
      fail(`Addition authored content drift for ${addition.contentId}`);
    }
  }
  const expectedAdditionIds = new Set(
    authority.records
      .filter((record) => record.disposition === 'accepted' && !baselineIds.has(record.contentId))
      .map((record) => record.contentId)
  );
  if (expectedAdditionIds.size !== EXPECTED_ADDITION_COUNT) {
    fail(`Expected ${EXPECTED_ADDITION_COUNT} accepted additions, found ${expectedAdditionIds.size}`);
  }
  if (stableJson([...additionIds].sort()) !== stableJson([...expectedAdditionIds].sort())) {
    fail('Addition identity set does not match accepted candidate identities outside the baseline');
  }
  const finalIds = new Set([...baselineIds, ...additionIds]);
  if (finalIds.size !== EXPECTED_IDENTITY_COUNT) {
    fail(`Final approved identity count is ${finalIds.size}`);
  }
  if (faqRecords.some((record) => !finalIds.has(record.contentId))) {
    fail('Final approved metadata leaves fallback FAQ identities');
  }
  const counts = authority.counts;
  if (
    !counts ||
    counts.candidates !== EXPECTED_CANDIDATE_COUNT ||
    counts.identities !== EXPECTED_IDENTITY_COUNT ||
    counts.baseline !== EXPECTED_BASELINE_COUNT ||
    counts.increment !== EXPECTED_INCREMENT_COUNT ||
    counts.additions !== EXPECTED_ADDITION_COUNT ||
    counts.mapped !== EXPECTED_BASELINE_COUNT + EXPECTED_ADDITION_COUNT
  ) {
    fail('Authority count contract drifted');
  }
  if (
    counts.fallback?.before !== EXPECTED_FALLBACK_BEFORE ||
    counts.fallback?.after !== EXPECTED_FALLBACK_AFTER ||
    counts.fallback?.delta !== EXPECTED_FALLBACK_AFTER - EXPECTED_FALLBACK_BEFORE
  ) {
    fail('Fallback count contract drifted');
  }
  return authority;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeAtomically(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  try {
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function parseArgs(argv) {
  const options = { mode: 'check', workbookPath: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--write') options.mode = 'write';
    else if (token === '--check') options.mode = 'check';
    else if (token === '--workbook') {
      const workbook = argv[++index];
      if (!workbook || workbook.startsWith('--')) fail('--workbook requires a path');
      options.workbookPath = path.resolve(workbook);
    } else if (token === '--help' || token === '-h') {
      console.log(
        'Usage: node scripts/generate-faq-metadata-authority.js --write --workbook <path> | --check [--workbook <path>]'
      );
      process.exit(0);
    } else fail(`Unknown argument: ${token}`);
  }
  if (options.mode === 'write' && !options.workbookPath) fail('--write requires --workbook <path>');
  return options;
}

function loadCommitted() {
  const authority = readJson(AUTHORITY_PATH);
  const baseline = readJson(BASELINE_PATH);
  const additions = readJson(ADDITIONS_PATH).records;
  const faqRecords = readEnglishFaq();
  const routeIdentity = loadRouteIdentity();
  validateAuthority(authority, { faqRecords, routeIdentity, baseline, additions });
  if (
    authority.additions.length !== additions.length ||
    stableJson(authority.additions) !== stableJson(additions)
  ) {
    fail('Committed addition projection disagrees with the authority');
  }
  return authority;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.mode === 'write') {
    const { authority, additions } = buildAuthority(options.workbookPath);
    writeAtomically(AUTHORITY_PATH, serialize(authority));
    writeAtomically(
      ADDITIONS_PATH,
      serialize({
        version: 1,
        source: { authority: path.basename(AUTHORITY_PATH), recordCount: additions.length },
        records: additions
      })
    );
    console.log(
      `[faq-metadata-authority] wrote candidates=${authority.counts.candidates} identities=${authority.counts.identities} additions=${authority.counts.additions}`
    );
    return authority;
  }

  const authority = loadCommitted();
  if (options.workbookPath) {
    const { authority: expected } = buildAuthority(options.workbookPath);
    if (stableJson(expected.source) !== stableJson(authority.source))
      fail('Committed source provenance disagrees with the workbook');
    if (stableJson(expected.records) !== stableJson(authority.records))
      fail('Committed candidate dispositions disagree with the workbook');
    if (stableJson(expected.additions) !== stableJson(authority.additions))
      fail('Committed metadata addition disagrees with the workbook');
  }
  console.log(
    `[faq-metadata-authority] check passed candidates=${authority.counts.candidates} identities=${authority.counts.identities} baseline=${authority.counts.baseline} additions=${authority.counts.additions} fallback=${authority.counts.fallback.after} delta=${authority.counts.fallback.delta}`
  );
  return authority;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  ADDITIONS_PATH,
  AUTHORITY_PATH,
  BASELINE_PATH,
  EXPECTED_ADDITION_COUNT,
  EXPECTED_BASELINE_COUNT,
  EXPECTED_CANDIDATE_COUNT,
  EXPECTED_FALLBACK_AFTER,
  EXPECTED_FALLBACK_BEFORE,
  EXPECTED_IDENTITY_COUNT,
  IDENTITY_RULES,
  SPECIAL_DISPOSITIONS,
  buildAuthority,
  candidateDigest,
  loadCommitted,
  metadataDigest,
  parseWeek05Candidates,
  stableJson,
  validateAuthority
};
