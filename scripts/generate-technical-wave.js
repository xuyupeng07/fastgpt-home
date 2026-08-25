#!/usr/bin/env node

/**
 * Materialize the bounded Week05 Technical Content Wave 1 as one rollback-capable source projection.
 * The generated governance files remain reviewable and the Wave 0 authority stays untouched.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  applyRollbackProjection,
  fileSha256,
  loadTechnicalAuthority,
  sha256,
  stableJson
} = require('./lib/technical-authority');
const {
  REGISTRY_RELATIVE_PATH,
  SEARCH_RELATIVE_PATH,
  WAVE_CONTENT_RELATIVE_PATH,
  WAVE_ID,
  WAVE_MANIFEST_RELATIVE_PATH,
  WAVE_PROJECTION_RELATIVE_PATH,
  WAVE_RELEASE_MANIFEST_RELATIVE_PATH,
  WAVE_ROLLBACK_RELATIVE_PATH,
  WAVE_BASELINE_PAGE_COUNT,
  buildReaderPage,
  buildWaveContentManifest,
  buildWaveProjection,
  buildWaveRollback,
  chooseWaveCandidates,
  loadWaveSelection,
  verifyWaveSource
} = require('./lib/technical-wave');
const { buildSearchProjection } = require('./import-technical-content');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8'));
}

function parseArgs(argv) {
  const options = { mode: null, failAt: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--write' || token === '--check') {
      if (options.mode) throw new Error('Choose one of --write or --check');
      options.mode = token.slice(2);
    } else if (token === '--fail-at') {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1)
        throw new Error('--fail-at requires a positive integer');
      options.failAt = value;
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  if (!options.mode) throw new Error('Choose --write or --check');
  if (options.mode === 'check' && options.failAt !== undefined) {
    throw new Error('--fail-at can only be used with --write');
  }
  return options;
}

function removeWaveEntries(entries, selection) {
  const selectedKeys = new Set(
    selection.candidates.map(
      (candidate) => `${candidate.identity.locale}|${candidate.identity.canonicalPath}`
    )
  );
  const baselineEntries = entries.filter((entry) => {
    const match = entry.slug?.match(/^\/([^/]+)(\/.*)$/);
    if (!match) throw new Error(`Invalid technical entry slug: ${entry.slug}`);
    return !selectedKeys.has(`${match[1]}|${match[2]}`);
  });
  if (baselineEntries.length !== WAVE_BASELINE_PAGE_COUNT) {
    throw new Error(
      `Wave 1 baseline registry count must be ${WAVE_BASELINE_PAGE_COUNT}; found ${baselineEntries.length}`
    );
  }
  return baselineEntries;
}

function buildWavePackage() {
  const authority = loadTechnicalAuthority(REPOSITORY_ROOT);
  const entries = readJson(REGISTRY_RELATIVE_PATH);
  const existingSearch = readJson(SEARCH_RELATIVE_PATH);
  if (!Array.isArray(entries) || !Array.isArray(existingSearch)) {
    throw new Error('Technical registry and search projection must be arrays');
  }
  if (existingSearch.length !== entries.length) {
    throw new Error('Technical registry and search projection counts must match before Wave 1');
  }
  if (JSON.stringify(existingSearch) !== JSON.stringify(buildSearchProjection(entries))) {
    throw new Error('Technical registry and search projection drift before Wave 1');
  }
  const selection = chooseWaveCandidates(authority, entries, loadWaveSelection(REPOSITORY_ROOT));
  const baselineEntries = removeWaveEntries(entries, selection);
  const readerDocuments = new Map();
  const readerPages = new Map();
  const readerPaths = [];
  for (const candidate of selection.candidates) {
    const readerPath = `src/content/tech-center${candidate.identity.canonicalPath}.md`;
    const readerPage = buildReaderPage(candidate);
    readerDocuments.set(readerPath, readerPage.document);
    readerPages.set(candidate.id, readerPage);
    readerPaths.push(readerPath);
  }
  const projectedEntries = [
    ...baselineEntries,
    ...selection.candidates.map((candidate) => readerPages.get(candidate.id).projection)
  ];
  const projectedSearch = buildSearchProjection(projectedEntries);
  const content = buildWaveContentManifest({
    selection,
    entries: projectedEntries,
    readerDocuments
  });
  const projection = buildWaveProjection({
    authority,
    entries: projectedEntries,
    selection
  });
  const rollback = buildWaveRollback({
    entries: projectedEntries,
    search: projectedSearch,
    projection
  });
  const manifest = {
    schemaVersion: 1,
    batch: 'week05',
    wave: WAVE_ID,
    status: 'source-verified',
    baseline: {
      wave: 'wave-0',
      pageCount: WAVE_BASELINE_PAGE_COUNT,
      publicationCount: 0
    },
    selection: {
      criteria: selection.criteria,
      selectedCount: selection.candidates.length,
      eligibleCount: selection.eligibleCount,
      topicCount: selection.topicCount,
      candidateIds: selection.candidates.map((candidate) => candidate.id),
      topics: selection.topics,
      approval: selection.approval
    },
    counts: {
      baselinePageCount: WAVE_BASELINE_PAGE_COUNT,
      acceptedCandidateCount: selection.candidates.length,
      acceptedAdd: projection.acceptedAdd,
      acceptedUpdate: projection.acceptedUpdate,
      publicPageDelta: projection.publicPageDelta,
      resultingPageCount: projection.resultingPageCount
    },
    content: {
      path: WAVE_CONTENT_RELATIVE_PATH,
      sha256: sha256(stableJson(content)),
      readerCount: content.readerCount
    },
    projection: {
      path: WAVE_PROJECTION_RELATIVE_PATH,
      sha256: sha256(stableJson(projection)),
      identityCount: projection.identities.length
    },
    rollback: {
      path: WAVE_ROLLBACK_RELATIVE_PATH,
      sha256: sha256(stableJson(rollback)),
      identityCount: rollback.waveIdentitySet.length
    },
    provenance: {
      authorityArtifact: 'src/content/tech-center/authority/week05-authority.json',
      authorityArtifactSha256: fileSha256(
        path.join(REPOSITORY_ROOT, 'src/content/tech-center/authority/week05-authority.json')
      ),
      sourceSetSha256: content.sourceSetSha256,
      historicalBaselinePageCount: WAVE_BASELINE_PAGE_COUNT,
      sourcePolicy: 'Wave 0 final accepted authority with public HTTPS maintainer evidence'
    },
    verification: {
      sourceVerified: true,
      exportVerified: false,
      releaseEligible: false
    }
  };
  const artifactBytes = new Map([
    [REGISTRY_RELATIVE_PATH, stableJson(projectedEntries)],
    [SEARCH_RELATIVE_PATH, stableJson(projectedSearch)],
    [WAVE_CONTENT_RELATIVE_PATH, stableJson(content)],
    [WAVE_MANIFEST_RELATIVE_PATH, stableJson(manifest)],
    [WAVE_PROJECTION_RELATIVE_PATH, stableJson(projection)],
    [WAVE_ROLLBACK_RELATIVE_PATH, stableJson(rollback)]
  ]);
  const releaseManifest = {
    schemaVersion: 1,
    batch: 'week05',
    wave: WAVE_ID,
    status: 'source-verified',
    sourceSetSha256: content.sourceSetSha256,
    baselinePageCount: WAVE_BASELINE_PAGE_COUNT,
    resultingPageCount: projection.resultingPageCount,
    writeStrategy: 'rollback-on-error',
    postWriteVerification: 'required',
    artifacts: [...artifactBytes.entries()].map(([relativePath, bytes]) => ({
      path: relativePath,
      sha256: sha256(bytes)
    }))
  };
  artifactBytes.set(WAVE_RELEASE_MANIFEST_RELATIVE_PATH, stableJson(releaseManifest));
  const files = [...readerPaths, ...artifactBytes.keys()].map((relativePath) =>
    path.join(REPOSITORY_ROOT, relativePath)
  );
  const contents = [
    ...readerPaths.map((relativePath) => readerDocuments.get(relativePath)),
    ...artifactBytes.values()
  ];
  return {
    authority,
    selection,
    entries: projectedEntries,
    search: projectedSearch,
    content,
    projection,
    rollback,
    manifest,
    releaseManifest,
    files,
    contents
  };
}

function writeWavePackage(wavePackage, failAt) {
  applyRollbackProjection({
    files: wavePackage.files,
    contents: wavePackage.contents,
    failAt
  });
  console.log(
    `[generate-technical-wave] source projection written: wave=${WAVE_ID} selected=${wavePackage.selection.candidates.length} pages=${wavePackage.projection.resultingPageCount}`
  );
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.mode === 'check') {
    const result = verifyWaveSource(REPOSITORY_ROOT);
    console.log(`[generate-technical-wave] source verification passed: ${JSON.stringify(result)}`);
    return result;
  }
  const wavePackage = buildWavePackage();
  writeWavePackage(wavePackage, options.failAt);
  const result = verifyWaveSource(REPOSITORY_ROOT);
  console.log(
    `[generate-technical-wave] post-write verification passed: ${JSON.stringify(result)}`
  );
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[generate-technical-wave] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildWavePackage,
  main,
  parseArgs,
  writeWavePackage
};
