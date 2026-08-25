const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  REQUIRED_CHECK_NAMES,
  isPublicHttpsTarget,
  isSensitiveHeader
} = require('./release-readiness');
const REVISION_PATTERN = /^[a-f0-9]{7,64}$/i;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeCheckName(value) {
  return value.trim().toLowerCase().replaceAll('_', '-').replaceAll(' ', '-');
}

function normalizeRepository(value) {
  if (!value || typeof value !== 'object') return {};
  const repository = {};
  for (const key of ['name', 'owner']) {
    if (typeof value[key] === 'string' && value[key].trim()) repository[key] = value[key].trim();
  }
  if (typeof value.url === 'string' && value.url.trim()) {
    const url = new URL(value.url.trim());
    if (url.protocol !== 'https:') throw new Error('Solutions owner repository must use HTTPS');
    if (url.username || url.password) {
      throw new Error('Solutions owner repository must not contain credentials');
    }
    url.search = '';
    url.hash = '';
    repository.url = url.href;
  }
  return repository;
}

/** Parse and constrain the approved preview origin before constructing request URLs. */
function parseHttpsTarget(value) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Solutions preview target is required');
  const target = new URL(value.trim());
  if (target.protocol !== 'https:' || target.username || target.password) {
    throw new Error('Solutions preview target must be an HTTPS URL without credentials');
  }
  if (!isPublicHttpsTarget(target.href)) {
    throw new Error('Solutions preview target must use a public hostname');
  }
  target.hash = '';
  target.search = '';
  return target;
}

function validatePath(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    throw new Error('Solutions contract request paths must be absolute paths');
  }
  const segments = value.split('/');
  if (segments.includes('..')) throw new Error(`Unsafe Solutions contract request path: ${value}`);
  return value;
}

function expectedHeaderMatches(headers, name, expected) {
  if (typeof expected !== 'string') return false;
  const actual = headers.get(name);
  return Boolean(actual && actual.toLowerCase().includes(expected.toLowerCase()));
}

function serializableHeaders(headers) {
  return Object.fromEntries([...headers.entries()].filter(([name]) => !isSensitiveHeader(name)));
}

function bodyContains(body, values, shouldContain) {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value) => typeof value === 'string')
    .filter((value) => (shouldContain ? !body.includes(value) : body.includes(value)))
    .map(() => (shouldContain ? 'missing required body marker' : 'forbidden body marker present'));
}

function verifyCanonical(body, expected) {
  if (typeof expected !== 'string') return [];
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<link\\b[^>]*rel=["']canonical["'][^>]*href=["']${escaped}["']`, 'i');
  return pattern.test(body) ? [] : ['missing self-canonical link'];
}

function normalizeRequest(request, index) {
  if (!request || typeof request !== 'object')
    throw new Error(`Invalid Solutions contract request ${index + 1}`);
  if (typeof request.name !== 'string' || !request.name.trim()) {
    throw new Error(`Solutions contract request ${index + 1} is missing name`);
  }
  const name = normalizeCheckName(request.name);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Unsafe Solutions contract request name: ${request.name}`);
  }
  const path = validatePath(request.path);
  const expectedStatus = request.expectedStatus ?? 200;
  if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) {
    throw new Error(`Invalid expected status for Solutions contract request ${name}`);
  }
  return { ...request, name, path, expectedStatus };
}

function hasBodyAssertion(request) {
  return (
    Array.isArray(request.bodyIncludes) &&
    request.bodyIncludes.some((value) => typeof value === 'string' && value)
  );
}

function validateContractRequests(requests, target) {
  const byName = new Map(requests.map((request) => [request.name, request]));
  const missing = REQUIRED_CHECK_NAMES.filter((name) => !byName.has(name));
  if (missing.length) {
    throw new Error(`Solutions HTTP contract is missing required requests: ${missing.join(', ')}`);
  }
  if (byName.get('root').path !== '/') {
    throw new Error('Solutions HTTP contract root request must use path /');
  }
  for (const name of ['robots', 'sitemap']) {
    const expectedPath = name === 'robots' ? '/robots.txt' : '/sitemap.xml';
    if (byName.get(name).path !== expectedPath) {
      throw new Error(`Solutions HTTP contract ${name} request must use path ${expectedPath}`);
    }
  }
  const bodyAssertionNames = REQUIRED_CHECK_NAMES.filter((name) => name !== 'canonical');
  const missingAssertions = bodyAssertionNames.filter(
    (name) => !hasBodyAssertion(byName.get(name))
  );
  if (missingAssertions.length) {
    throw new Error(
      `Solutions HTTP contract requires body assertions for: ${missingAssertions.join(', ')}`
    );
  }
  const canonicalRequest = byName.get('canonical');
  const expectedCanonical = new URL(canonicalRequest.path, target).href;
  if (canonicalRequest.canonical !== expectedCanonical) {
    throw new Error('Solutions HTTP contract canonical request requires canonical URL assertion');
  }
  const projectionHeaders = Object.fromEntries(
    Object.entries(byName.get('projections').headers || {}).map(([name, value]) => [
      name.toLowerCase(),
      String(value).toLowerCase()
    ])
  );
  if (
    !projectionHeaders['x-robots-tag']?.includes('noindex') ||
    !projectionHeaders['x-robots-tag']?.includes('nofollow') ||
    !projectionHeaders['content-type']?.includes('text/plain')
  ) {
    throw new Error(
      'Solutions HTTP contract projections request requires noindex,nofollow and text/plain headers'
    );
  }
  const seenPaths = new Map();
  for (const request of requests) {
    if (request.name === 'canonical') continue;
    if (seenPaths.has(request.path)) {
      throw new Error(
        `Solutions HTTP contract requests must use distinct paths: ${seenPaths.get(
          request.path
        )} and ${request.name}`
      );
    }
    seenPaths.set(request.path, request.name);
  }
}

/** Run the owner-supplied Solutions P0 HTTP request contract against one HTTPS target. */
async function runSolutionsPreviewContract({
  target: rawTarget,
  approvedTarget: rawApprovedTarget,
  contract,
  artifactDirectory
}) {
  const target = parseHttpsTarget(rawTarget);
  const approvedTarget = rawApprovedTarget ? parseHttpsTarget(rawApprovedTarget) : undefined;
  if (approvedTarget && approvedTarget.origin !== target.origin) {
    throw new Error('Solutions preview target differs from the approved target');
  }
  if (!contract || typeof contract !== 'object')
    throw new Error('Solutions HTTP contract must be an object');
  if (!Array.isArray(contract.requests) || !contract.requests.length) {
    throw new Error('Solutions HTTP contract must include at least one request');
  }
  const requests = contract.requests.map(normalizeRequest);
  const names = new Set();
  for (const request of requests) {
    if (names.has(request.name)) {
      throw new Error('Solutions HTTP contract request names must be unique');
    }
    names.add(request.name);
  }
  validateContractRequests(requests, target);
  const repository = normalizeRepository(contract.repository);
  if (typeof fetch !== 'function') throw new Error('Node fetch is unavailable');

  const checks = [];
  const artifacts = [];
  const responses = [];
  const capturedAt = new Date().toISOString();
  for (const request of requests) {
    const url = new URL(request.path, target);
    if (url.origin !== target.origin)
      throw new Error(`Request escaped approved target: ${request.path}`);
    const detail = [];
    let response;
    let body = '';
    try {
      response = await fetch(url, { redirect: 'manual' });
      const bytes = Buffer.from(await response.arrayBuffer());
      body = bytes.toString('utf8');
      const artifact = {
        path: `responses/${request.name}.body`,
        role: 'solutions-preview-http-response',
        bytes: bytes.length,
        sha256: sha256(bytes),
        capturedAt
      };
      if (artifactDirectory) {
        const responsePath = path.join(artifactDirectory, `${request.name}.body`);
        fs.mkdirSync(path.dirname(responsePath), { recursive: true });
        fs.writeFileSync(responsePath, bytes);
        artifact.path = `responses/${request.name}.body`;
      }
      artifacts.push(artifact);
      responses.push({
        name: request.name,
        requestPath: request.path,
        artifactPath: artifact.path,
        status: response.status,
        expectedStatus: request.expectedStatus,
        headers: serializableHeaders(response.headers),
        bytes: bytes.length,
        sha256: sha256(bytes)
      });
      if (response.status !== request.expectedStatus) {
        detail.push(`expected HTTP ${request.expectedStatus}, received ${response.status}`);
      }
      for (const [name, expected] of Object.entries(request.headers || {})) {
        if (!expectedHeaderMatches(response.headers, name, expected)) {
          detail.push(`header ${name} did not include the required value`);
        }
      }
      detail.push(...bodyContains(body, request.bodyIncludes, true));
      detail.push(...bodyContains(body, request.bodyExcludes, false));
      detail.push(...verifyCanonical(body, request.canonical));
    } catch (error) {
      detail.push(error.message);
    }
    checks.push({
      name: request.name,
      status: detail.length ? 'blocked' : 'passed',
      detail: detail.length ? detail.join('; ') : `HTTP ${response.status} ${url.pathname}`
    });
  }

  const blockers = [];
  if (!repository.url && !repository.name)
    blockers.push({ code: 'solutions-owner-repository-missing' });
  if (typeof contract.revision !== 'string' || !REVISION_PATTERN.test(contract.revision.trim())) {
    blockers.push({ code: 'solutions-owner-revision-invalid' });
  }
  if (contract.approvedTarget !== true || !approvedTarget) {
    blockers.push({ code: 'solutions-preview-target-unapproved' });
  }
  return {
    producer: 'fastgpt-solutions-preview-http-runner',
    runnerVersion: 1,
    status:
      checks.every((check) => check.status === 'passed') && blockers.length === 0
        ? 'passed'
        : 'blocked',
    repository,
    revision: contract.revision,
    target: target.href,
    approvedTarget: contract.approvedTarget === true && Boolean(approvedTarget),
    capturedAt: new Date().toISOString(),
    checks,
    artifacts,
    responses,
    blockers
  };
}

module.exports = { parseHttpsTarget, runSolutionsPreviewContract };
