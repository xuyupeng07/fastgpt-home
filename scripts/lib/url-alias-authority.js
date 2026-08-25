const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const AUTHORITY_RELATIVE_PATH = path.join('src', 'config', 'url-alias-authority.json');
const AUTHORITY_HOSTS = new Set(['fastgpt.cn', 'fastgpt.io']);
const DISPOSITIONS = new Set(['accepted', 'denied', 'merged', 'conflict']);
const URL_ALIAS_SLICE_REASONS = new Set([
  'case-only',
  'cross-host',
  'slug-rebuild',
  'rebuilt-slug'
]);
const URL_ALIAS_CONTRACT = Object.freeze({
  sourceHosts: Object.freeze({ 'fastgpt.cn': 37, 'fastgpt.io': 1251 }),
  sources: 1288,
  targets: 1274,
  manyToOneTargets: 8,
  slices: Object.freeze({
    'case-only': Object.freeze({
      sources: 743,
      sourceHosts: Object.freeze({ 'fastgpt.cn': 23, 'fastgpt.io': 720 })
    }),
    'rebuilt-slug': Object.freeze({
      sources: 545,
      sourceHosts: Object.freeze({ 'fastgpt.cn': 14, 'fastgpt.io': 531 })
    })
  })
});

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function authorityError(message) {
  return new Error(`[url-alias-authority] ${message}`);
}

function getAuthorityPath(rootDir) {
  return path.join(rootDir, AUTHORITY_RELATIVE_PATH);
}

function normalizeAuthorityInput(input) {
  if (Array.isArray(input)) return { schemaVersion: 1, records: input };
  if (input && typeof input === 'object' && Array.isArray(input.records)) return input;
  throw authorityError('authority must contain a records array');
}

function validateHost(value, label) {
  if (typeof value !== 'string' || !AUTHORITY_HOSTS.has(value)) {
    throw authorityError(`${label} must be one of fastgpt.cn or fastgpt.io`);
  }
  return value;
}

function validatePath(value, label) {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    throw authorityError(`${label} must start with /`);
  }
  if (value.includes('?') || value.includes('#')) {
    throw authorityError(`${label} must exclude query strings and fragments`);
  }
  if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%]*$/.test(value)) {
    throw authorityError(`${label} contains an unsupported URL path character`);
  }
  if (/\s|[\u0000-\u001f\u007f]/.test(value)) {
    throw authorityError(`${label} contains whitespace or a control character`);
  }
  if (/%(?:2f|2F|5c|5C)/.test(value)) {
    throw authorityError(`${label} must not encode / or \\`);
  }
  if (/%(?![0-9a-fA-F]{2})/.test(value)) {
    throw authorityError(`${label} contains an invalid percent escape`);
  }
  if (value.includes('//') || /(?:^|\/)\.\.?(?:\/|$)/.test(value)) {
    throw authorityError(`${label} contains an ambiguous path segment`);
  }
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw authorityError(`${label} contains an invalid percent escape`);
  }
  if (/(?:^|\/)\.\.?(?:\/|$)/.test(decoded)) {
    throw authorityError(`${label} contains an ambiguous encoded path segment`);
  }
  if (/\s|[\u0000-\u001f\u007f]/.test(decoded)) {
    throw authorityError(`${label} contains encoded whitespace or a control character`);
  }
  return value;
}

function validateEvidence(record, index) {
  const label = `record ${index + 1}`;
  for (const field of [
    'evidenceSource',
    'workbookSha256',
    'workbookSheet',
    'worksheetRow',
    'businessNumber',
    'reason',
    'disposition'
  ]) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      throw authorityError(`${label} is missing ${field}`);
    }
  }
  if (!Number.isInteger(record.worksheetRow) || record.worksheetRow < 2) {
    throw authorityError(`${label} worksheetRow must be an integer >= 2`);
  }
  if (!/^[0-9a-f]{64}$/i.test(record.workbookSha256)) {
    throw authorityError(`${label} workbookSha256 must be a 64-character hexadecimal digest`);
  }
  if (typeof record.disposition !== 'string' || !DISPOSITIONS.has(record.disposition)) {
    throw authorityError(`${label} has an unsupported disposition`);
  }
}

function validateSourceManifest(authority, records) {
  if (!Array.isArray(authority.sources)) return;
  if (!authority.sources.length) throw authorityError('authority sources must not be empty');

  const recordCounts = new Map();
  for (const record of records) {
    const key = record.evidenceSource;
    recordCounts.set(key, (recordCounts.get(key) || 0) + 1);
  }

  const manifestSources = new Set();
  let manifestCount = 0;
  for (const [index, source] of authority.sources.entries()) {
    if (!source || typeof source !== 'object') {
      throw authorityError(`authority source ${index + 1} must be an object`);
    }
    for (const field of ['workbook', 'sha256', 'sheet', 'acceptedRows']) {
      if (source[field] === undefined || source[field] === null || source[field] === '') {
        throw authorityError(`authority source ${index + 1} is missing ${field}`);
      }
    }
    if (!/^[0-9a-f]{64}$/i.test(source.sha256)) {
      throw authorityError(`authority source ${index + 1} sha256 must be a 64-character hexadecimal digest`);
    }
    if (!Number.isInteger(source.acceptedRows) || source.acceptedRows < 1) {
      throw authorityError(`authority source ${index + 1} acceptedRows must be a positive integer`);
    }
    if (manifestSources.has(source.workbook)) {
      throw authorityError(`authority source manifest repeats workbook: ${source.workbook}`);
    }
    manifestSources.add(source.workbook);
    manifestCount += source.acceptedRows;
    const recordCount = recordCounts.get(source.workbook) || 0;
    if (recordCount !== source.acceptedRows) {
      throw authorityError(
        `authority source count drift for ${source.workbook}: manifest=${source.acceptedRows}, records=${recordCount}`
      );
    }
  }

  if (manifestCount !== records.length) {
    throw authorityError(
      `authority source manifest count must equal records.length (${records.length})`
    );
  }
  for (const record of records) {
    if (!manifestSources.has(record.evidenceSource)) {
      throw authorityError(`record evidence source is missing from authority sources: ${record.evidenceSource}`);
    }
    const source = authority.sources.find((candidate) => candidate.workbook === record.evidenceSource);
    if (source.sha256 !== record.workbookSha256 || source.sheet !== record.workbookSheet) {
      throw authorityError(`record provenance disagrees with authority source: ${record.evidenceSource}`);
    }
  }
}

function recordKey(host, urlPath) {
  return `${host}${urlPath}`;
}

function targetUrl(targetHost, targetPath, baseUrls) {
  const baseUrl = baseUrls?.[targetHost] || `https://${targetHost}`;
  return `${baseUrl.replace(/\/$/, '')}${targetPath}`;
}

function getTerminalTargetSets(rootDir) {
  const { getPublishedFaqIds } = require('./redirects');
  const { chinese, english } = getPublishedFaqIds(rootDir);
  return {
    'fastgpt.cn': new Set(chinese.map((slug) => `/faq/${slug}`)),
    'fastgpt.io': new Set(english.map((slug) => `/faq/${slug}`))
  };
}

function validateUrlAliasAuthority(input, options = {}) {
  const authority = normalizeAuthorityInput(input);
  const requireEvidence = options.requireEvidence === true;
  const acceptedRecords = [];
  const bySource = new Map();

  if (authority.schemaVersion !== undefined && authority.schemaVersion !== 1) {
    throw authorityError(`unsupported schemaVersion: ${authority.schemaVersion}`);
  }
  if (
    authority.recordCount !== undefined &&
    (!Number.isInteger(authority.recordCount) || authority.recordCount !== authority.records.length)
  ) {
    throw authorityError(`recordCount must equal records.length (${authority.records.length})`);
  }

  authority.records.forEach((record, index) => {
    if (!record || typeof record !== 'object') {
      throw authorityError(`record ${index + 1} must be an object`);
    }
    for (const field of ['sourceHost', 'sourcePath', 'targetHost', 'targetPath']) {
      if (!(field in record)) throw authorityError(`record ${index + 1} is missing ${field}`);
    }
    if (requireEvidence) validateEvidence(record, index);
    const sourceHost = validateHost(record.sourceHost, `record ${index + 1} sourceHost`);
    const sourcePath = validatePath(record.sourcePath, `record ${index + 1} sourcePath`);
    const targetHost = validateHost(record.targetHost, `record ${index + 1} targetHost`);
    const targetPath = validatePath(record.targetPath, `record ${index + 1} targetPath`);
    if (options.rejectCrossHost === true && sourceHost !== targetHost) {
      throw authorityError(
        `cross-host mapping is not allowed: ${sourceHost}${sourcePath} -> ${targetHost}${targetPath}`
      );
    }
    const disposition = record.disposition || 'accepted';
    if (!DISPOSITIONS.has(disposition)) {
      throw authorityError(`record ${index + 1} has an unsupported disposition: ${disposition}`);
    }
    const normalized = { ...record, sourceHost, sourcePath, targetHost, targetPath, disposition };
    if (disposition !== 'accepted') return;

    const sourceKey = recordKey(sourceHost, sourcePath);
    const targetKey = recordKey(targetHost, targetPath);
    const existing = bySource.get(sourceKey);
    if (existing) {
      if (existing.targetKey !== targetKey) {
        throw authorityError(
          `source-to-many mapping for ${sourceKey}: ${existing.targetKey} and ${targetKey}`
        );
      }
      throw authorityError(`duplicate source mapping for ${sourceKey}`);
    }
    if (sourceKey === targetKey) {
      throw authorityError(`self redirect is forbidden for ${sourceKey}`);
    }
    bySource.set(sourceKey, { targetKey, record: normalized });
    acceptedRecords.push(normalized);
  });

  validateSourceManifest(authority, acceptedRecords);

  for (const [sourceKey] of bySource) {
    const visited = new Set();
    let currentKey = sourceKey;
    while (bySource.has(currentKey)) {
      if (visited.has(currentKey)) {
        throw authorityError(`redirect cycle is forbidden: ${sourceKey} revisits ${currentKey}`);
      }
      visited.add(currentKey);
      currentKey = bySource.get(currentKey).targetKey;
    }
    if (visited.size > 1) {
      throw authorityError(`redirect chain is forbidden: ${sourceKey} targets ${currentKey}`);
    }
  }

  if (options.rootDir) {
    const terminalTargets = getTerminalTargetSets(options.rootDir);
    for (const record of acceptedRecords) {
      const expectedPaths = terminalTargets[record.targetHost];
      if (!expectedPaths.has(record.targetPath)) {
        throw authorityError(
          `target is not a published terminal FAQ: ${record.targetHost}${record.targetPath}`
        );
      }
    }
  }

  acceptedRecords.sort((left, right) => {
    const sourceLeft = recordKey(left.sourceHost, left.sourcePath);
    const sourceRight = recordKey(right.sourceHost, right.sourcePath);
    return compareStrings(sourceLeft, sourceRight);
  });

  return {
    authority,
    records: acceptedRecords,
    bySource: new Map(
      acceptedRecords.map((record) => [recordKey(record.sourceHost, record.sourcePath), record])
    )
  };
}

function isValidatedAuthorityResult(input) {
  return Boolean(
    input &&
      typeof input === 'object' &&
      Array.isArray(input.records) &&
      input.bySource instanceof Map &&
      input.authority &&
      typeof input.authority === 'object'
  );
}

function getValidatedAuthorityResult(input) {
  return isValidatedAuthorityResult(input) ? input : validateUrlAliasAuthority(input);
}

function readUrlAliasAuthority(rootDir, options = {}) {
  const authorityPath = getAuthorityPath(rootDir);
  if (!fs.existsSync(authorityPath)) {
    throw authorityError(`missing authority file: ${AUTHORITY_RELATIVE_PATH}`);
  }
  const authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
  return validateUrlAliasAuthority(authority, {
    ...options,
    requireEvidence: options.requireEvidence ?? true,
    rootDir
  });
}

function buildUrlAliasProjection(authorityResult, sourceHost, baseUrls) {
  const authority = getValidatedAuthorityResult(authorityResult);
  validateHost(sourceHost, 'projection sourceHost');
  const projection = new Map();
  for (const record of authority.records) {
    if (record.sourceHost !== sourceHost) continue;
    projection.set(record.sourcePath, targetUrl(record.targetHost, record.targetPath, baseUrls));
  }
  return projection;
}

function getUrlAliasSlice(authorityResult, reason, options = {}) {
  if (!URL_ALIAS_SLICE_REASONS.has(reason)) {
    throw authorityError(`unsupported URL Alias slice: ${reason}`);
  }
  const authority = getValidatedAuthorityResult(authorityResult);
  const records = authority.records.filter((record) =>
    reason === 'rebuilt-slug'
      ? record.reason === 'slug-rebuild' || record.reason === 'cross-host'
      : record.reason === reason
  );
  const sources = authority.authority.sources
    ?.map((source) => ({
      ...source,
      acceptedRows: records.filter((record) => record.evidenceSource === source.workbook).length
    }))
    .filter((source) => source.acceptedRows > 0);
  const slice = validateUrlAliasAuthority(
    {
      ...authority.authority,
      recordCount: records.length,
      ...(sources ? { sources } : {}),
      records
    },
    {
      requireEvidence: options.requireEvidence === true,
      rootDir: options.rootDir
    }
  );

  if (reason === 'case-only') {
    const normalizeCaseOnlyPath = (urlPath) =>
      urlPath.startsWith('/en/faq/') ? urlPath.slice('/en'.length) : urlPath;
    for (const record of slice.records) {
      if (record.sourceHost !== record.targetHost) {
        throw authorityError(
          `case-only records must stay on one host: ${record.sourceHost}${record.sourcePath} -> ${record.targetHost}${record.targetPath}`
        );
      }
      if (
        record.sourcePath === record.targetPath ||
        normalizeCaseOnlyPath(record.sourcePath).toLowerCase() !== record.targetPath.toLowerCase()
      ) {
        throw authorityError(
          `case-only records must differ only by path case: ${record.sourceHost}${record.sourcePath} -> ${record.targetHost}${record.targetPath}`
        );
      }
    }
  }

  return slice;
}

function getUrlAliasAuthorityDigest(authorityResult) {
  const records = getValidatedAuthorityResult(authorityResult).records;
  return crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
}

function getUrlAliasAuthoritySummary(authorityResult) {
  const records = getValidatedAuthorityResult(authorityResult).records;
  const byHost = Object.fromEntries(
    [...new Set(records.map((record) => record.sourceHost))].map((host) => [
      host,
      records.filter((record) => record.sourceHost === host).length
    ])
  );
  const targets = new Set(records.map((record) => recordKey(record.targetHost, record.targetPath)));
  const targetSources = new Map();
  for (const record of records) {
    const key = recordKey(record.targetHost, record.targetPath);
    targetSources.set(key, (targetSources.get(key) || 0) + 1);
  }
  const reasons = Object.fromEntries(
    [...new Set(records.map((record) => record.reason))]
      .sort(compareStrings)
      .map((reason) => [reason, records.filter((record) => record.reason === reason).length])
  );
  const targetHosts = Object.fromEntries(
    [...new Set(records.map((record) => record.targetHost))]
      .sort(compareStrings)
      .map((host) => [host, records.filter((record) => record.targetHost === host).length])
  );
  return {
    sources: records.length,
    sourceHosts: byHost,
    targets: targets.size,
    manyToOneTargets: [...targetSources.values()].filter((count) => count > 1).length,
    reasons,
    targetHosts,
    digest: getUrlAliasAuthorityDigest({ records })
  };
}

module.exports = {
  AUTHORITY_RELATIVE_PATH,
  AUTHORITY_HOSTS,
  URL_ALIAS_CONTRACT,
  buildUrlAliasProjection,
  getAuthorityPath,
  getValidatedAuthorityResult,
  getUrlAliasAuthorityDigest,
  getUrlAliasAuthoritySummary,
  getUrlAliasSlice,
  readUrlAliasAuthority,
  recordKey,
  targetUrl,
  validatePath,
  validateUrlAliasAuthority
};
