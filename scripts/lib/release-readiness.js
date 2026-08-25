const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const RELEASE_READINESS_SCHEMA_VERSION = 1;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REVISION_PATTERN = /^[a-f0-9]{7,64}$/i;
const SOLUTIONS_RUNNER_PRODUCER = 'fastgpt-solutions-preview-http-runner';
const SOLUTIONS_RUNNER_VERSION = 1;
const REQUIRED_CHECK_GROUPS = [
  { code: 'root', names: ['root'] },
  { code: 'routes', names: ['routes', 'route-inventory'] },
  { code: 'robots', names: ['robots', 'robots-txt'] },
  { code: 'sitemap', names: ['sitemap', 'sitemap-xml'] },
  { code: 'canonical', names: ['canonical', 'canonicals'] },
  { code: 'internal-links', names: ['internal-links', 'internal-link'] },
  { code: 'projections', names: ['projections', 'markdown-text-projections'] }
];
const REQUIRED_CHECK_NAMES = REQUIRED_CHECK_GROUPS.map(({ code }) => code);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sanitizeUrl(value) {
  if (typeof value !== 'string') return value;
  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
  } catch {
    return '<invalid-url>';
  }
}

/** Return whether a target is a public HTTPS origin safe for the preview runner. */
function isPublicHttpsTarget(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  let target;
  try {
    target = new URL(value.trim());
  } catch {
    return false;
  }
  if (target.protocol !== 'https:' || target.username || target.password) return false;
  const hostname = target.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const ipVersion = net.isIP(hostname);
  const privateIpv4 =
    ipVersion === 4 &&
    (hostname.startsWith('0.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('127.') ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('192.0.0.') ||
      hostname.startsWith('192.0.2.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('198.18.') ||
      hostname.startsWith('198.19.') ||
      hostname.startsWith('198.51.100.') ||
      hostname.startsWith('203.0.113.') ||
      /^100\.(6[4-9]|[7-9]\d)\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname));
  const privateIpv6 =
    ipVersion === 6 &&
    (hostname === '::' ||
      hostname === '::1' ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe80:') ||
      hostname.startsWith('::ffff:'));
  return !(
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    privateIpv4 ||
    privateIpv6
  );
}

function isSensitiveHeader(name) {
  const normalized = String(name).toLowerCase();
  return (
    [
      'authorization',
      'cookie',
      'proxy-authorization',
      'proxy-authenticate',
      'set-cookie',
      'www-authenticate'
    ].includes(normalized) ||
    /(api[-_]?key|access[-_]?token|auth[-_]?token|session[-_]?token|token|secret|password)/.test(
      normalized
    )
  );
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])])
  );
}

function stableJson(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function digestJson(value) {
  return sha256(stableJson(value));
}

function stripObservationTimestamps(value) {
  if (Array.isArray(value)) return value.map(stripObservationTimestamps);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'capturedAt')
      .map(([key, entry]) => [key, stripObservationTimestamps(entry)])
  );
}

function normalizePath(root, filePath) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(resolvedRoot, resolvedPath).replaceAll(path.sep, '/');
  return relative && !relative.startsWith('../') && relative !== '..' ? relative : resolvedPath;
}

/** Return byte size and SHA-256 provenance for one repository or generated file. */
function fileProvenance(filePath, options = {}) {
  const bytes = fs.readFileSync(filePath);
  return {
    path: normalizePath(options.root || process.cwd(), filePath),
    role: options.role || 'artifact',
    source: options.source || 'repository',
    bytes: bytes.length,
    sha256: sha256(bytes),
    capturedAt: options.capturedAt || new Date().toISOString()
  };
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

/** Inventory a directory recursively while preserving deterministic file ordering. */
function directoryInventory(directory, options = {}) {
  const capturedAt = options.capturedAt || new Date().toISOString();
  const files = walkFiles(directory)
    .sort()
    .map((filePath) => fileProvenance(filePath, { ...options, capturedAt }));
  const content = files.map(({ capturedAt: ignored, ...entry }) => entry);
  return {
    path: normalizePath(options.root || process.cwd(), directory),
    role: options.role || 'static-export',
    source: options.source || 'repository',
    status: fs.existsSync(directory) ? 'passed' : 'missing',
    bytes: files.reduce((total, file) => total + file.bytes, 0),
    sha256: digestJson(content),
    files,
    capturedAt
  };
}

function normalizeStatus(value) {
  if (value === true) return 'passed';
  if (typeof value !== 'string') return 'unknown';
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('_', '-');
  if (['pass', 'passed', 'success', 'succeeded', 'release-eligible'].includes(normalized))
    return 'passed';
  if (['block', 'blocked', 'failure', 'failed', 'fail', 'unresolved'].includes(normalized))
    return 'blocked';
  if (['skip', 'skipped', 'not-provided', 'missing'].includes(normalized)) return 'not-provided';
  return normalized || 'unknown';
}

function normalizeCheckName(value) {
  return value.trim().toLowerCase().replaceAll('_', '-').replaceAll(' ', '-');
}

function normalizeChecks(value) {
  if (Array.isArray(value)) {
    return value.flatMap((check) => {
      if (!check || typeof check !== 'object') return [];
      const name = typeof check.name === 'string' ? check.name : check.id;
      if (typeof name !== 'string' || !name.trim()) return [];
      return [
        {
          name: normalizeCheckName(name),
          status: normalizeStatus(check.status ?? check.passed),
          detail: typeof check.detail === 'string' ? check.detail : undefined
        }
      ];
    });
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([name, check]) => ({
    name: normalizeCheckName(name),
    status: normalizeStatus(
      typeof check === 'object' && check !== null ? check.status ?? check.passed : check
    ),
    detail:
      typeof check === 'object' && check !== null
        ? typeof check.detail === 'string'
          ? check.detail
          : undefined
        : undefined
  }));
}

function normalizeRepository(value) {
  if (!value || typeof value !== 'object') return {};
  const url = typeof value.url === 'string' ? value.url.trim() : undefined;
  const name = typeof value.name === 'string' ? value.name.trim() : undefined;
  const owner = typeof value.owner === 'string' ? value.owner.trim() : undefined;
  return {
    ...(url ? { url } : {}),
    ...(name ? { name } : {}),
    ...(owner ? { owner } : {})
  };
}

function normalizeArtifact(artifact) {
  if (!artifact || typeof artifact !== 'object') return { invalid: true };
  const artifactPath = typeof artifact.path === 'string' ? artifact.path.trim() : '';
  const normalizedArtifactPath = artifactPath.replaceAll('\\', '/');
  if (
    !normalizedArtifactPath ||
    normalizedArtifactPath.startsWith('/') ||
    /^[a-z]:\//i.test(normalizedArtifactPath) ||
    normalizedArtifactPath.includes('\0') ||
    normalizedArtifactPath.split('/').includes('..')
  ) {
    return { path: artifactPath || undefined, invalid: true };
  }
  return {
    path: normalizedArtifactPath,
    ...(typeof artifact.role === 'string' ? { role: artifact.role } : {}),
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    ...(typeof artifact.capturedAt === 'string' ? { capturedAt: artifact.capturedAt } : {})
  };
}

function requiredCheckBlockers(checks) {
  const blockers = [];
  const passed = new Set(
    checks.filter((check) => check.status === 'passed').map((check) => check.name)
  );
  REQUIRED_CHECK_NAMES.forEach((name) => {
    if (!passed.has(name)) blockers.push({ code: `solutions-http-check-required:${name}` });
  });
  return blockers;
}

function normalizeResponses(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((response) => {
    if (!response || typeof response !== 'object') return [];
    const name = typeof response.name === 'string' ? response.name.trim() : '';
    const requestPath = typeof response.requestPath === 'string' ? response.requestPath.trim() : '';
    const artifactPath =
      typeof response.artifactPath === 'string'
        ? response.artifactPath.trim().replaceAll('\\', '/')
        : '';
    if (!name || !requestPath || !artifactPath) return [];
    return [
      {
        name,
        requestPath,
        artifactPath,
        status: response.status,
        headers:
          response.headers &&
          typeof response.headers === 'object' &&
          !Array.isArray(response.headers)
            ? Object.fromEntries(
                Object.entries(response.headers).filter(([name]) => !isSensitiveHeader(name))
              )
            : {},
        expectedStatus: response.expectedStatus,
        bytes: response.bytes,
        sha256: response.sha256,
        ...(typeof response.body === 'string' ? { body: response.body } : {})
      }
    ];
  });
}

function responseBindingBlockers(checks, responses, artifacts) {
  const blockers = [];
  const checkNames = new Set();
  const responseNames = new Set();
  const artifactsByPath = new Map();
  const responsesByName = new Map();
  const responsePaths = new Map();
  const artifactUsers = new Map();

  for (const check of checks) {
    if (checkNames.has(check.name)) {
      blockers.push({ code: `solutions-http-check-duplicate:${check.name}` });
    }
    checkNames.add(check.name);
  }
  for (const response of responses) {
    if (responseNames.has(response.name)) {
      blockers.push({ code: `solutions-response-duplicate:${response.name}` });
    }
    responseNames.add(response.name);
    responsesByName.set(response.name, response);
    const group = REQUIRED_CHECK_GROUPS.find(({ names }) => names.includes(response.name));
    if (group?.code === 'root' && response.requestPath !== '/') {
      blockers.push({ code: `solutions-response-path-invalid:${response.name}` });
    }
    if (group?.code === 'robots' && response.requestPath !== '/robots.txt') {
      blockers.push({ code: `solutions-response-path-invalid:${response.name}` });
    }
    if (group?.code === 'sitemap' && response.requestPath !== '/sitemap.xml') {
      blockers.push({ code: `solutions-response-path-invalid:${response.name}` });
    }
    if (group?.code !== 'canonical') {
      if (responsePaths.has(response.requestPath)) {
        blockers.push({ code: `solutions-response-path-duplicate:${response.name}` });
      }
      responsePaths.set(response.requestPath, response.name);
    }
    if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
      blockers.push({ code: `solutions-response-status-invalid:${response.name}` });
    }
    if (
      !Number.isInteger(response.expectedStatus) ||
      response.expectedStatus < 100 ||
      response.expectedStatus > 599
    ) {
      blockers.push({ code: `solutions-response-expected-status-missing:${response.name}` });
    } else if (response.status !== response.expectedStatus) {
      blockers.push({ code: `solutions-response-expected-status-mismatch:${response.name}` });
    }
  }
  for (const artifact of artifacts) {
    if (!artifact.path) continue;
    if (artifactsByPath.has(artifact.path)) {
      blockers.push({ code: `solutions-artifact-duplicate:${artifact.path}` });
    }
    artifactsByPath.set(artifact.path, artifact);
  }
  for (const check of checks) {
    const response = responsesByName.get(check.name);
    if (!response) {
      blockers.push({ code: `solutions-response-missing:${check.name}` });
      continue;
    }
    const artifact = artifactsByPath.get(response.artifactPath);
    if (!artifact) {
      blockers.push({ code: `solutions-response-artifact-missing:${check.name}` });
      continue;
    }
    if (artifact.bytes !== response.bytes || artifact.sha256 !== response.sha256) {
      blockers.push({ code: `solutions-response-artifact-mismatch:${check.name}` });
    }
    const previousUser = artifactUsers.get(response.artifactPath);
    if (previousUser) {
      blockers.push({ code: `solutions-response-artifact-shared:${previousUser}:${check.name}` });
    } else {
      artifactUsers.set(response.artifactPath, check.name);
    }
  }
  for (const artifact of artifacts) {
    if (!artifact.capturedAt || Number.isNaN(Date.parse(artifact.capturedAt))) {
      blockers.push({ code: `solutions-artifact-timestamp-missing:${artifact.path || 'unknown'}` });
    }
  }
  return blockers;
}

/** Verify persisted response bodies against the response checksums in one companion directory. */
function verifyResponseDirectory(responses, directory) {
  if (!directory || !fs.existsSync(directory)) {
    return [{ code: 'solutions-response-artifact-directory-missing' }];
  }
  const blockers = [];
  for (const response of responses) {
    const normalizedArtifactPath = response.artifactPath.replaceAll('\\', '/');
    const directoryRelative = path.relative(process.cwd(), directory).replaceAll(path.sep, '/');
    const relativeArtifactPath =
      directoryRelative &&
      (normalizedArtifactPath === directoryRelative ||
        normalizedArtifactPath.startsWith(`${directoryRelative}/`))
        ? normalizedArtifactPath.slice(directoryRelative.length + 1)
        : normalizedArtifactPath.startsWith('responses/')
        ? normalizedArtifactPath.slice('responses/'.length)
        : normalizedArtifactPath;
    const filePath = path.resolve(directory, relativeArtifactPath);
    const relativeToDirectory = path.relative(path.resolve(directory), filePath);
    if (relativeToDirectory.startsWith('../') || relativeToDirectory === '..') {
      blockers.push({ code: `solutions-response-artifact-path-invalid:${response.name}` });
      continue;
    }
    if (!fs.existsSync(filePath)) {
      blockers.push({ code: `solutions-response-artifact-file-missing:${response.name}` });
      continue;
    }
    const bytes = fs.readFileSync(filePath);
    if (bytes.length !== response.bytes || sha256(bytes) !== response.sha256) {
      blockers.push({ code: `solutions-response-artifact-file-mismatch:${response.name}` });
    }
  }
  return blockers;
}

/** Normalize and validate the separately owned Solutions preview HTTP result. */
function normalizeSolutionsEvidence(input, options = {}) {
  const provenance = options.provenance;
  if (!input) {
    return {
      schemaVersion: RELEASE_READINESS_SCHEMA_VERSION,
      kind: 'solutions-preview-http',
      source: 'cross-project',
      evidenceTier: 'preview-http',
      status: 'not-provided',
      claim: false,
      blockers: [
        {
          code: 'solutions-preview-http-evidence-missing',
          detail: 'Solutions preview HTTP evidence was not supplied to the release coordinator'
        }
      ],
      checks: [],
      artifacts: [],
      provenance
    };
  }

  const source =
    input && typeof input === 'object' && input.result && typeof input.result === 'object'
      ? input.result
      : input;
  if (!source || typeof source !== 'object') return normalizeSolutionsEvidence();
  const status = normalizeStatus(source.status);
  const producer = source.producer;
  const runnerVersion = source.runnerVersion;
  const repository = normalizeRepository(source.repository);
  const repositoryInput = source.repository;
  const revision = typeof source.revision === 'string' ? source.revision.trim() : '';
  const rawTarget = typeof source.target === 'string' ? source.target.trim() : '';
  const target = sanitizeUrl(rawTarget);
  const approvedTarget = source.approvedTarget === true;
  const approvedTargetSource =
    typeof options.approvedTarget === 'string' ? options.approvedTarget.trim() : '';
  const capturedAt = typeof source.capturedAt === 'string' ? source.capturedAt : undefined;
  const checks = normalizeChecks(source.checks);
  const artifacts = Array.isArray(source.artifacts) ? source.artifacts.map(normalizeArtifact) : [];
  const responses = normalizeResponses(source.responses);
  const blockers = [];

  if (producer !== SOLUTIONS_RUNNER_PRODUCER || runnerVersion !== SOLUTIONS_RUNNER_VERSION) {
    blockers.push({ code: 'solutions-http-runner-provenance-missing' });
  }
  if (status !== 'passed') blockers.push({ code: `solutions-preview-http-${status}` });
  let parsedTarget;
  try {
    parsedTarget = new URL(rawTarget);
  } catch {
    parsedTarget = undefined;
  }
  if (!isPublicHttpsTarget(rawTarget)) {
    blockers.push({
      code: 'solutions-preview-target-invalid',
      detail: 'Preview target must be HTTPS'
    });
  }
  if (!approvedTarget) blockers.push({ code: 'solutions-preview-target-unapproved' });
  let parsedApprovedTarget;
  if (!approvedTargetSource) {
    blockers.push({ code: 'solutions-approved-target-source-missing' });
  } else {
    try {
      parsedApprovedTarget = new URL(approvedTargetSource);
      if (!isPublicHttpsTarget(approvedTargetSource)) throw new Error('approved target is unsafe');
      if (parsedTarget && parsedApprovedTarget.origin !== parsedTarget.origin) {
        blockers.push({ code: 'solutions-approved-target-mismatch' });
      }
    } catch {
      blockers.push({ code: 'solutions-approved-target-invalid' });
    }
  }
  if (!revision) blockers.push({ code: 'solutions-owner-revision-missing' });
  else if (!REVISION_PATTERN.test(revision)) {
    blockers.push({ code: 'solutions-owner-revision-invalid' });
  }
  if (!repository.url && !repository.name)
    blockers.push({ code: 'solutions-owner-repository-missing' });
  if (repository.url) {
    try {
      const repositoryUrl = new URL(repository.url);
      if (repositoryUrl.protocol !== 'https:') {
        blockers.push({ code: 'solutions-owner-repository-invalid' });
        delete repository.url;
      } else if (repositoryUrl.username || repositoryUrl.password) {
        blockers.push({ code: 'solutions-owner-repository-credentials' });
        repository.url = `${repositoryUrl.origin}${repositoryUrl.pathname}`;
      }
      if (repository.url) {
        const safeRepositoryUrl = new URL(repository.url);
        safeRepositoryUrl.search = '';
        safeRepositoryUrl.hash = '';
        repository.url = safeRepositoryUrl.href;
      }
    } catch {
      blockers.push({ code: 'solutions-owner-repository-invalid' });
      delete repository.url;
    }
  } else if (
    repositoryInput &&
    typeof repositoryInput === 'object' &&
    typeof repositoryInput.url === 'string'
  ) {
    blockers.push({ code: 'solutions-owner-repository-invalid' });
  }
  if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) {
    blockers.push({ code: 'solutions-evidence-timestamp-missing' });
  }
  if (!checks.length) blockers.push({ code: 'solutions-http-checks-missing' });
  else blockers.push(...requiredCheckBlockers(checks));
  if (checks.length && responses.length !== checks.length) {
    blockers.push({ code: 'solutions-http-responses-incomplete' });
  }
  if (checks.some((check) => check.status !== 'passed')) {
    blockers.push({ code: 'solutions-http-check-failed' });
  }
  for (const artifact of artifacts) {
    if (
      artifact.invalid ||
      !artifact.path ||
      !Number.isInteger(artifact.bytes) ||
      artifact.bytes < 0 ||
      !SHA256_PATTERN.test(typeof artifact.sha256 === 'string' ? artifact.sha256 : '')
    ) {
      blockers.push({ code: `solutions-artifact-invalid:${artifact.path || 'unknown'}` });
    }
    if (!artifact.capturedAt || Number.isNaN(Date.parse(artifact.capturedAt))) {
      blockers.push({ code: `solutions-artifact-timestamp-missing:${artifact.path || 'unknown'}` });
    }
  }
  for (const response of responses) {
    const bodyBytes =
      typeof response.body === 'string' ? Buffer.byteLength(response.body) : undefined;
    if (
      !response.requestPath.startsWith('/') ||
      response.requestPath.startsWith('//') ||
      response.requestPath.includes('\\') ||
      response.requestPath.includes('\0') ||
      response.requestPath.split('/').includes('..') ||
      response.artifactPath.startsWith('/') ||
      response.artifactPath.includes('\0') ||
      response.artifactPath.split('/').includes('..') ||
      !Number.isInteger(response.bytes) ||
      response.bytes < 0 ||
      !SHA256_PATTERN.test(typeof response.sha256 === 'string' ? response.sha256 : '')
    ) {
      blockers.push({ code: `solutions-response-invalid:${response.name}` });
    }
    if (
      typeof response.body === 'string' &&
      (bodyBytes !== response.bytes || sha256(response.body) !== response.sha256)
    ) {
      blockers.push({ code: `solutions-response-checksum-mismatch:${response.name}` });
    }
  }
  blockers.push(...responseBindingBlockers(checks, responses, artifacts));
  const safeResponses = responses.map(({ body: ignored, ...response }) => response);

  return {
    schemaVersion: RELEASE_READINESS_SCHEMA_VERSION,
    kind: 'solutions-preview-http',
    producer,
    runnerVersion,
    source: 'cross-project',
    evidenceTier: 'preview-http',
    status: blockers.length ? 'blocked' : 'passed',
    claim: blockers.length === 0,
    repository,
    revision,
    target,
    approvedTarget,
    capturedAt,
    checks,
    artifacts,
    responses: safeResponses,
    blockers,
    provenance
  };
}

/** Build the timestamp-independent release decision and its deterministic digest. */
function buildDeterministicReadiness(record) {
  const tiers = record.evidenceTiers || {};
  const crossProject = record.crossProjectInputs?.solutionsPreviewHttp || {};
  const sources = stripObservationTimestamps(record.sourceProvenance || []);
  const artifacts = stripObservationTimestamps(record.artifacts || []);
  const rollback = stripObservationTimestamps(record.rollback?.inventory || []);
  const result = {
    schemaVersion: RELEASE_READINESS_SCHEMA_VERSION,
    issue: record.issue,
    status: record.status,
    releaseEligible: record.evidence?.releaseEligible === true,
    evidenceTiers: Object.fromEntries(
      Object.entries(tiers).map(([tier, value]) => [
        tier,
        { state: value.state, claim: value.claim === true }
      ])
    ),
    sources,
    counts: record.counts,
    variants: (record.variants || []).map((variant) => ({
      variant: variant.variant,
      outcome: variant.outcome,
      counts: variant.counts,
      artifacts: stripObservationTimestamps(variant.artifacts || {})
    })),
    crossProjectInputs: {
      solutionsPreviewHttp: {
        status: crossProject.status,
        claim: crossProject.claim === true,
        producer: crossProject.producer,
        runnerVersion: crossProject.runnerVersion,
        repository: crossProject.repository,
        revision: crossProject.revision,
        target: crossProject.target,
        approvedTarget: crossProject.approvedTarget === true,
        checks: crossProject.checks,
        artifacts: stripObservationTimestamps(crossProject.artifacts || []),
        responses: stripObservationTimestamps(
          (crossProject.responses || []).map(({ headers: ignored, ...response }) => response)
        ),
        blockers: stripObservationTimestamps(
          (crossProject.blockers || []).map(
            ({ detail: ignored, output: ignoredOutput, ...blocker }) => blocker
          )
        ),
        provenance: crossProject.provenance
          ? {
              path: crossProject.provenance.path,
              role: crossProject.provenance.role,
              source: crossProject.provenance.source,
              bytes: crossProject.provenance.bytes,
              sha256: crossProject.provenance.sha256
            }
          : undefined
      }
    },
    blockers: stripObservationTimestamps(
      (record.blockers || []).map(
        ({ detail: ignored, output: ignoredOutput, ...blocker }) => blocker
      )
    ),
    artifacts,
    rollback
  };
  return { ...result, sha256: digestJson(result) };
}

module.exports = {
  REQUIRED_CHECK_GROUPS,
  REQUIRED_CHECK_NAMES,
  RELEASE_READINESS_SCHEMA_VERSION,
  SOLUTIONS_RUNNER_PRODUCER,
  SOLUTIONS_RUNNER_VERSION,
  buildDeterministicReadiness,
  digestJson,
  directoryInventory,
  fileProvenance,
  isPublicHttpsTarget,
  isSensitiveHeader,
  normalizeSolutionsEvidence,
  sha256,
  stableJson,
  verifyResponseDirectory
};
