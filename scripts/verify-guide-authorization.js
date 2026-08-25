#!/usr/bin/env node

/**
 * Verify customer-case and asset authorization before projecting finance Guides.
 * The authority files remain internal build inputs and never enter reader-facing Markdown.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'src/content/guides/registry.json');
const POLICY_PATH = path.join(ROOT, 'src/content/guides/policy.json');
const DEFAULT_AUTHORIZATION_PATH = path.join(ROOT, 'src/content/guides/authorization.json');
const FIXTURE_ROOT = path.join(ROOT, 'scripts/fixtures/guides');
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const FINANCE_SLUGS = ['finance-research-retrieval', 'finance-daily-report-automation'];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fixturePath(nameOrPath) {
  if (!nameOrPath || nameOrPath === 'complete') {
    return path.join(FIXTURE_ROOT, 'authorization-complete.json');
  }
  if (nameOrPath === 'missing') {
    return path.join(FIXTURE_ROOT, 'authorization-missing.json');
  }
  return path.resolve(ROOT, nameOrPath);
}

function loadFixture(nameOrPath = 'complete') {
  const filePath = fixturePath(nameOrPath);
  const fixture = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const fixtureName = ['complete', 'missing'].includes(nameOrPath)
    ? nameOrPath
    : path.basename(filePath);
  Object.defineProperty(fixture, 'fixtureName', { value: fixtureName, enumerable: false });
  return fixture;
}

function loadAuthority() {
  return JSON.parse(fs.readFileSync(DEFAULT_AUTHORIZATION_PATH, 'utf8'));
}

function addBlocker(blockers, category, id, reason) {
  blockers.push(`${category} ${id}: ${reason}`);
}

function validateEvidence(evidence, category, id, blockers) {
  if (!evidence || typeof evidence !== 'object') {
    addBlocker(blockers, category, id, 'missing evidence record');
    return;
  }
  if (evidence.status !== 'valid') {
    addBlocker(blockers, category, id, `evidence status is ${evidence.status || 'missing'}`);
  }
  if (typeof evidence.reference !== 'string' || !evidence.reference.trim()) {
    addBlocker(blockers, category, id, 'evidence reference is missing');
  }
  if (typeof evidence.digest !== 'string' || !SHA256_PATTERN.test(evidence.digest)) {
    addBlocker(blockers, category, id, 'evidence digest must be a SHA-256 value');
  } else if (typeof evidence.reference === 'string' && evidence.reference.trim()) {
    const expectedDigest = sha256(evidence.reference.trim());
    if (evidence.digest !== expectedDigest) {
      addBlocker(blockers, category, id, 'evidence digest does not match its reference');
    }
  }
}

function evaluateGuideAuthorization(slug, record) {
  if (!FINANCE_SLUGS.includes(slug)) {
    return {
      slug,
      status: 'publishable',
      eligible: true,
      blockers: [],
      requiredCases: 0,
      requiredAssets: 0
    };
  }

  const blockers = [];
  if (!record || typeof record !== 'object') {
    addBlocker(blockers, 'authorization', slug, 'record is missing');
    return {
      slug,
      status: 'release-blocked',
      eligible: false,
      blockers,
      requiredCases: 0,
      requiredAssets: 0
    };
  }

  const requiredCases = Array.isArray(record.requiredCases) ? record.requiredCases : [];
  const requiredAssets = Array.isArray(record.requiredAssets) ? record.requiredAssets : [];
  if (!requiredCases.length) addBlocker(blockers, 'case', slug, 'required case list is empty');
  if (!requiredAssets.length) addBlocker(blockers, 'asset', slug, 'required asset list is empty');

  const seenCases = new Set();
  for (const item of requiredCases) {
    const id = item && typeof item.id === 'string' ? item.id : 'unknown-case';
    if (!SAFE_ID_PATTERN.test(id)) addBlocker(blockers, 'case', id, 'invalid case identifier');
    if (seenCases.has(id)) addBlocker(blockers, 'case', id, 'duplicate case identifier');
    seenCases.add(id);
    if (!item || typeof item.label !== 'string' || !item.label.trim()) {
      addBlocker(blockers, 'case', id, 'reader-facing case label is missing from authority');
    }
    validateEvidence(item && item.evidence, 'case', id, blockers);
  }

  const seenAssets = new Set();
  for (const item of requiredAssets) {
    const id = item && typeof item.id === 'string' ? item.id : 'unknown-asset';
    if (!SAFE_ID_PATTERN.test(id)) addBlocker(blockers, 'asset', id, 'invalid asset identifier');
    if (seenAssets.has(id)) addBlocker(blockers, 'asset', id, 'duplicate asset identifier');
    seenAssets.add(id);
    if (
      !item ||
      typeof item.path !== 'string' ||
      !item.path.startsWith('/') ||
      item.path.includes('..') ||
      typeof item.alt !== 'string' ||
      !item.alt.trim()
    ) {
      addBlocker(blockers, 'asset', id, 'asset path or alt text is missing');
    }
    validateEvidence(item && item.evidence, 'asset', id, blockers);
  }

  return {
    slug,
    status: blockers.length ? 'release-blocked' : 'publishable',
    eligible: blockers.length === 0,
    blockers,
    requiredCases: requiredCases.length,
    requiredAssets: requiredAssets.length
  };
}

function decisionFor(decisions, slug) {
  if (decisions instanceof Map) return decisions.get(slug);
  if (decisions && typeof decisions === 'object') return decisions[slug];
  return undefined;
}

function projectGuideEntries(entries, decisions) {
  if (!Array.isArray(entries)) throw new Error('registry entries must be an array');
  return entries.filter((entry) => {
    if (!FINANCE_SLUGS.includes(entry.slug)) return true;
    return decisionFor(decisions, entry.slug)?.eligible === true;
  });
}

function validateFixtureShape(fixture) {
  if (!fixture || typeof fixture !== 'object')
    throw new Error('authorization fixture must be an object');
  if (fixture.schemaVersion !== 1) throw new Error('authorization fixture schemaVersion must be 1');
  if (
    !Array.isArray(fixture.requiredSlugs) ||
    fixture.requiredSlugs.join('\u0000') !== FINANCE_SLUGS.join('\u0000')
  ) {
    throw new Error(`authorization fixture requiredSlugs must be ${FINANCE_SLUGS.join(', ')}`);
  }
  if (!fixture.records || typeof fixture.records !== 'object') {
    throw new Error('authorization fixture records are missing');
  }
  for (const slug of FINANCE_SLUGS) {
    if (!Object.prototype.hasOwnProperty.call(fixture.records, slug)) {
      throw new Error(`${slug}: authorization record is missing`);
    }
  }
}

function verifyFixture(fixture) {
  validateFixtureShape(fixture);
  const decisions = new Map(
    FINANCE_SLUGS.map((slug) => [slug, evaluateGuideAuthorization(slug, fixture.records[slug])])
  );
  for (const slug of FINANCE_SLUGS) {
    const decision = decisions.get(slug);
    const record = fixture.records[slug];
    for (const asset of record?.requiredAssets || []) {
      if (typeof asset.path !== 'string') continue;
      if (!fs.existsSync(path.join(ROOT, 'public', asset.path))) {
        decision.blockers.push(`asset ${asset.id}: public asset is missing`);
      }
    }
    if (decision.blockers.length) {
      decision.status = 'release-blocked';
      decision.eligible = false;
    }
  }
  const projectedEntries = projectGuideEntries(registry.entries, decisions);
  const financeEntries = projectedEntries
    .filter((entry) => FINANCE_SLUGS.includes(entry.slug))
    .map((entry) => entry.slug);
  const blocked = [...decisions.values()].filter((decision) => !decision.eligible);
  const fixtureName = fixture.fixtureName || 'custom';
  const expectedProjectedEntries =
    fixtureName === 'missing' ? policy.entryCount - FINANCE_SLUGS.length : policy.entryCount;
  if (registry.entries.length !== policy.entryCount) {
    throw new Error(
      `registry count ${registry.entries.length} does not match policy ${policy.entryCount}`
    );
  }
  if (fixtureName === 'complete' && blocked.length) {
    throw new Error(
      `complete authorization fixture is release-blocked: ${blocked[0].blockers.join('; ')}`
    );
  }
  if (fixtureName === 'missing' && blocked.length !== FINANCE_SLUGS.length) {
    throw new Error('missing authorization fixture must block every required finance pair');
  }
  if (projectedEntries.length !== expectedProjectedEntries) {
    throw new Error(
      `${fixtureName} projection expected ${expectedProjectedEntries} entries, received ${projectedEntries.length}`
    );
  }
  if (fixtureName === 'complete' && financeEntries.length !== FINANCE_SLUGS.length) {
    throw new Error('complete authorization fixture must project both finance pairs');
  }
  if (fixtureName === 'missing' && financeEntries.length) {
    throw new Error(
      `missing authorization fixture projected blocked slugs: ${financeEntries.join(', ')}`
    );
  }
  return {
    fixture: fixtureName,
    status: blocked.length ? 'release-blocked' : 'publishable',
    registryEntries: registry.entries.length,
    projectedEntries: projectedEntries.length,
    financeSlugs: financeEntries,
    excludedSlugs: FINANCE_SLUGS.filter((slug) => !financeEntries.includes(slug)),
    decisions: [...decisions.values()]
  };
}

function verifyAuthorizationFixtures({ fixture } = {}) {
  const completeFixture = loadFixture('complete');
  const authority = loadAuthority();
  validateFixtureShape(authority);
  if (JSON.stringify(authority) !== JSON.stringify(completeFixture)) {
    throw new Error(
      'src/content/guides/authorization.json must match the complete authorization fixture'
    );
  }
  const targetFixtures = fixture ? [fixture] : [completeFixture, loadFixture('missing')];
  const results = {};
  for (const item of targetFixtures) {
    const result = verifyFixture(item);
    results[result.fixture] = result;
  }
  return {
    schemaVersion: 1,
    status: 'passed',
    ...results
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  if (!argv.length) return {};
  if (argv.length !== 2 || argv[0] !== '--fixture' || !argv[1]) {
    throw new Error(
      'Usage: node scripts/verify-guide-authorization.js [--fixture complete|missing|<path>]'
    );
  }
  return { fixture: argv[1] };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = options.fixture
    ? verifyAuthorizationFixtures({ fixture: loadFixture(options.fixture) })
    : verifyAuthorizationFixtures();
  const complete = result.complete;
  const missing = result.missing;
  if (complete) {
    console.log(
      `[verify-guide-authorization] complete fixture=${complete.status} registry=${complete.registryEntries} projected=${complete.projectedEntries} finance=${complete.financeSlugs.length}`
    );
  }
  if (missing) {
    const blockers = missing.decisions.flatMap((decision) => decision.blockers).join(' | ');
    console.log(
      `[verify-guide-authorization] missing fixture=${missing.status} registry=${
        missing.registryEntries
      } projected=${missing.projectedEntries} excluded=${missing.excludedSlugs.join(
        ','
      )} blockers=${blockers}`
    );
  }
  console.log(`GUIDE_AUTHORIZATION_RESULT=${JSON.stringify(result)}`);
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[verify-guide-authorization] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_AUTHORIZATION_PATH,
  FINANCE_SLUGS,
  evaluateGuideAuthorization,
  loadFixture,
  main,
  parseArgs,
  projectGuideEntries,
  verifyAuthorizationFixtures,
  verifyFixture
};
