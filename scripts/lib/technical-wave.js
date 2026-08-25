#!/usr/bin/env node

/**
 * Build and verify the bounded Week05 Wave 1 publication unit.
 * Wave 0 authority remains a governance-only, zero-publication baseline.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  PUBLIC_TECHNICAL_PAGE_COUNT,
  fileSha256,
  identityKey,
  loadTechnicalAuthority,
  projectAuthority,
  sha256,
  stableJson,
  validateTechnicalAuthority,
  verifyProjectionConsistency,
  verifyPersistedArtifacts
} = require('./technical-authority');
const {
  buildNormalizedTechnicalPage,
  buildSearchProjection
} = require('../import-technical-content');

const WAVE_ID = 'wave-1';
const WAVE_MIN_CANDIDATES = 25;
const WAVE_MAX_CANDIDATES = 50;
const WAVE_BASELINE_PAGE_COUNT = PUBLIC_TECHNICAL_PAGE_COUNT;
const REGISTRY_RELATIVE_PATH = 'src/components/tech-center/entries.json';
const SEARCH_RELATIVE_PATH = 'public/tech-center/search-index.json';
const WAVE_MANIFEST_RELATIVE_PATH = 'src/content/tech-center/authority/week05-wave1-manifest.json';
const WAVE_SELECTION_RELATIVE_PATH =
  'src/content/tech-center/authority/week05-wave1-selection.json';
const WAVE_CONTENT_RELATIVE_PATH = 'src/content/tech-center/authority/week05-wave1-content.json';
const WAVE_PROJECTION_RELATIVE_PATH =
  'src/content/tech-center/authority/week05-wave1-projection.json';
const WAVE_ROLLBACK_RELATIVE_PATH = 'src/content/tech-center/authority/week05-wave1-rollback.json';
const WAVE_RELEASE_MANIFEST_RELATIVE_PATH =
  'src/content/tech-center/authority/week05-wave1-release-manifest.json';
const PUBLIC_CANONICAL_HOST = 'https://fastgpt.cn';
const WAVE_SURFACES = [
  'registry',
  'search',
  'sitemap',
  'staticExport',
  'releaseRecord',
  'rollback'
];
const WAVE_PUBLIC_SURFACES = [
  REGISTRY_RELATIVE_PATH,
  SEARCH_RELATIVE_PATH,
  'sitemap.xml',
  'static-export/technical-pages',
  'release-record/technical-wave',
  WAVE_PROJECTION_RELATIVE_PATH
];
const READER_CONTENT_CONTRACT = [
  'reader-content',
  'public-citation',
  'environment-version-scope',
  'error-fingerprint',
  'safeguards',
  'rollback-guidance'
];

const CREDENTIAL_PATTERNS = [
  /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/gi,
  /\bBearer\s+(?!\[REDACTED_CREDENTIAL\])[A-Za-z0-9._~+/=-]{6,}/gi,
  /\beyJ[A-Za-z0-9._-]{20,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s`:@]+:[^\s`@]+@/gi,
  /\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*(?!\[REDACTED_CREDENTIAL\]|YOUR_API_KEY|<[^>]+>)[^\s,`)}]+/gi
];

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
}

function assertText(value, label) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} must be non-empty text`);
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
}

function parseEntryIdentity(entry) {
  const match = entry.slug?.match(/^\/([^/]+)(\/.*)$/);
  if (!match) throw new Error(`Invalid technical entry slug: ${entry.slug}`);
  return { locale: match[1], canonicalPath: match[2] };
}

function sanitizeReaderText(value) {
  let sanitized = String(value)
    .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/gi, '[REDACTED_CREDENTIAL]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, 'Bearer [REDACTED_CREDENTIAL]')
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, '[REDACTED_CREDENTIAL]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED_CREDENTIAL]')
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED_CREDENTIAL]')
    .replace(
      /\b((?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/)[^\s`:@]+:[^\s`@]+@/gi,
      '$1[REDACTED_CREDENTIAL]@'
    )
    .replace(
      /(\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["'`]?)([^\s,"'`}]+)/gi,
      '$1[REDACTED_CREDENTIAL]'
    )
    .replace(
      /([?&](?:token|key|secret|api[_-]?key|access[_-]?token)=)[^&\s)`]+/gi,
      '$1[REDACTED_CREDENTIAL]'
    )
    .replace(/\b(?:mytoken|mykey|sk-fastgpt|sk-tarzan)\b/gi, '[REDACTED_CREDENTIAL]');
  return sanitized.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function containsCredentialShape(value) {
  return CREDENTIAL_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function extractVersionScope(value) {
  const versions = [
    ...String(value).matchAll(/(?<!\d)(?:v(?:ersion)?\s*)?\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.]+)?/gi)
  ].map((match) => match[0].trim());
  return [...new Set(versions)].slice(0, 8);
}

function topicKey(candidate) {
  const source =
    `${candidate.identity.canonicalPath} ${candidate.evidence.fingerprint}`.toLowerCase();
  if (/api|aiproxy|base64|chatid|file-url|auth|token|unauthor/.test(source)) return 'api-access';
  if (/knowledge|dataset|embedding|rerank|markerpdf|index|vector/.test(source))
    return 'knowledge-indexing';
  if (/workflow|orchestration|classif|plugin|tool|context/.test(source))
    return 'workflow-integration';
  if (/docker|deploy|gpu|container|proxy|sse|gateway|timeout/.test(source))
    return 'deployment-runtime';
  if (/model|json|prompt|reply|image|voice|analysis/.test(source)) return 'model-experience';
  return 'application-behavior';
}

function validateWaveCandidate(candidate, baselineIdentityKeys) {
  const failures = [];
  if (candidate.state !== 'accepted' || candidate.decision?.disposition !== 'accepted') {
    failures.push('final-accepted-state-required');
  }
  if (!['add', 'update'].includes(candidate.decision?.operation)) {
    failures.push('accepted-operation-required');
  }
  if (candidate.evidence.status !== 'verified' || !candidate.evidence.sources.length) {
    failures.push('verified-public-evidence-required');
  }
  if (candidate.evidence.fingerprint.length < 24)
    failures.push('recognizable-fingerprint-required');
  if (!candidate.evidence.applicability.trim()) failures.push('explicit-applicability-required');
  if (candidate.security.status === 'needs-review') failures.push('credential-review-unresolved');
  if (candidate.security.findings.some((finding) => finding.disposition === 'denied')) {
    failures.push('denied-security-finding');
  }
  if (candidate.operationRisk.level === 'D0') failures.push('D0-operation-risk-denied');
  if (['D1', 'D2'].includes(candidate.operationRisk.level)) {
    for (const field of ['warning', 'prerequisite', 'rollback']) {
      if (candidate.operationRisk[field].length < 8)
        failures.push(`${candidate.operationRisk.level}-${field}-required`);
    }
  }
  const key = identityKey(candidate.identity);
  if (baselineIdentityKeys.has(key)) failures.push('existing-identity-collision');
  if (candidate.evidence.sources.some((source) => !/^https:\/\/[^/]+/.test(source))) {
    failures.push('public-https-source-required');
  }
  if (containsCredentialShape(candidate.evidence.fingerprint)) {
    failures.push('credential-shaped-evidence');
  }
  return failures;
}

function loadWaveSelection(repoRoot = path.resolve(__dirname, '../..')) {
  const selectionPath = path.join(repoRoot, WAVE_SELECTION_RELATIVE_PATH);
  if (!fs.existsSync(selectionPath)) {
    throw new Error(`Wave 1 approved selection is missing: ${WAVE_SELECTION_RELATIVE_PATH}`);
  }
  const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
  assertObject(selection, 'Wave 1 approved selection');
  assertArray(selection.criteria, 'Wave 1 approved selection criteria');
  assertArray(selection.candidateIds, 'Wave 1 approved candidate IDs');
  if (
    selection.schemaVersion !== 1 ||
    selection.batch !== 'week05' ||
    selection.wave !== WAVE_ID ||
    selection.status !== 'approved'
  ) {
    throw new Error('Wave 1 approved selection metadata drift');
  }
  assertText(selection.reviewer, 'Wave 1 approved selection reviewer');
  if (
    selection.candidateIds.length < WAVE_MIN_CANDIDATES ||
    selection.candidateIds.length > WAVE_MAX_CANDIDATES
  ) {
    throw new Error(
      `Wave 1 approved selection must contain ${WAVE_MIN_CANDIDATES}-${WAVE_MAX_CANDIDATES} candidates`
    );
  }
  if (new Set(selection.candidateIds).size !== selection.candidateIds.length) {
    throw new Error('Wave 1 approved selection contains duplicate candidate IDs');
  }
  selection.candidateIds.forEach((candidateId, index) =>
    assertText(candidateId, `Wave 1 approved candidate IDs[${index}]`)
  );
  return {
    ...selection,
    provenance: {
      path: WAVE_SELECTION_RELATIVE_PATH,
      sha256: fileSha256(selectionPath)
    }
  };
}

function chooseWaveCandidates(authority, entries, approvedSelection) {
  validateTechnicalAuthority(authority);
  assertArray(entries, 'entries');
  assertObject(approvedSelection, 'approvedSelection');
  const acceptedIds = new Set(authority.final.accepted);
  const accepted = authority.candidates.filter((candidate) => acceptedIds.has(candidate.id));
  const baselineIdentityKeys = new Set(
    entries
      .map(parseEntryIdentity)
      .filter(
        (identity) =>
          !accepted.some((candidate) => identityKey(candidate.identity) === identityKey(identity))
      )
      .map(identityKey)
  );
  const eligible = accepted.filter(
    (candidate) => validateWaveCandidate(candidate, baselineIdentityKeys).length === 0
  );
  if (eligible.length < WAVE_MIN_CANDIDATES) {
    throw new Error(
      `Wave 1 has only ${eligible.length} eligible candidates; minimum is ${WAVE_MIN_CANDIDATES}`
    );
  }

  const eligibleById = new Map(eligible.map((candidate) => [candidate.id, candidate]));
  const selected = approvedSelection.candidateIds.map((candidateId) => {
    const candidate = eligibleById.get(candidateId);
    if (!candidate) {
      const known = authority.candidates.some((entry) => entry.id === candidateId);
      throw new Error(
        known
          ? `Wave 1 approved candidate is ineligible: ${candidateId}`
          : `Wave 1 approved candidate is unknown: ${candidateId}`
      );
    }
    return candidate;
  });
  const topics = selected.map((candidate) => ({
    candidateId: candidate.id,
    topic: topicKey(candidate)
  }));
  const topicCount = new Set(topics.map(({ topic }) => topic)).size;
  if (topicCount < 4) throw new Error(`Wave 1 topic diversity is ${topicCount}; minimum is 4`);
  return {
    criteria: approvedSelection.criteria,
    candidates: selected,
    topics,
    topicCount,
    eligibleCount: eligible.length,
    baselinePageCount: WAVE_BASELINE_PAGE_COUNT,
    approval: {
      reviewer: approvedSelection.reviewer,
      ...approvedSelection.provenance
    }
  };
}

function buildReaderBody(candidate) {
  assertObject(candidate, 'candidate');
  const title = sanitizeReaderText(candidate.title);
  const fingerprint = sanitizeReaderText(candidate.evidence.fingerprint);
  const applicability = sanitizeReaderText(candidate.evidence.applicability);
  const versions = extractVersionScope(candidate.evidence.fingerprint);
  const versionScope = versions.length
    ? `维护者记录涉及 ${versions.join('、')}；应用前请在目标环境确认实际 FastGPT 与相关组件版本。`
    : '维护者记录未给出完整版本号；应用前请在目标环境确认实际 FastGPT 与相关组件版本。';
  const risk = candidate.operationRisk;
  const riskGuidance =
    risk.level === 'none'
      ? '权威审查未识别破坏性操作。仍应先在可恢复环境验证，并保留变更前配置与日志。'
      : `风险等级为 ${risk.level}。${sanitizeReaderText(risk.warning)} ${sanitizeReaderText(
          risk.prerequisite
        )}`;
  const rollback =
    risk.level === 'none'
      ? '保留变更前的镜像、配置和数据备份；验证失败时恢复上一份完整技术内容投影，并重新执行受影响场景。'
      : sanitizeReaderText(risk.rollback);
  return `# ${title}

## 适用环境与版本范围

- **环境：** ${applicability}
- **版本范围：** ${versionScope}
- **适用边界：** 这篇说明只覆盖公开维护者来源中记录的现象。先核对部署方式、相关组件和请求入口，再执行处理步骤。

## 问题指纹

${
  fingerprint
    ? `> ${fingerprint}`
    : '> 维护者来源提供了可核验的问题描述，请以原始记录中的完整日志为准。'
}

使用问题指纹定位同一故障：记录完整错误文本、发生时间、FastGPT 版本、相关组件版本和复现入口。请求 ID、应用 ID、账号标识与任何凭证都应替换为 [REDACTED_CREDENTIAL] 或其他不可用占位符。

## 排查步骤

1. 在目标环境确认上面的版本范围和部署边界，并保存当前配置、容器状态与相关日志。
2. 将日志中的错误文本与问题指纹逐项比对，区分启动、请求、索引、工作流和前端运行时阶段。
3. 先使用公开来源中记录的最小可逆调整，单次只改变一个变量，并记录调整前后的配置差异。
4. 重新执行触发故障的最小场景，确认成功响应、索引状态、工作流结果或页面行为恢复。
5. 将验证结果与原始维护者来源对照；环境或版本超出范围时暂停扩大变更并重新确认适用性。

## 安全护栏

- ${riskGuidance}
- 任何示例凭证、访问令牌、私钥、连接串密码和真实业务标识都不进入日志、截图或读者输出。
- 变更前完成可恢复备份，限制操作范围，并保留验证命令的结果摘要。

## 回滚指引

- ${rollback}
- 回滚后再次执行问题指纹对应的最小复现，并确认服务健康、数据完整和公开入口可用。

## 维护者证据

> 来源：[FastGPT maintainer source](${candidate.provenance.sourceUrl})
`;
}

function buildReaderPage(candidate) {
  const body = buildReaderBody(candidate);
  return buildNormalizedTechnicalPage({
    metadata: {
      title: sanitizeReaderText(candidate.title),
      slug: `/${candidate.identity.locale}${candidate.identity.canonicalPath}`,
      page_type: '故障排查',
      source: candidate.provenance.sourceUrl,
      source_type: candidate.sourceType
    },
    identity: candidate.identity,
    body,
    wordCount: body.length,
    sourceCount: 1,
    label: `Wave 1 ${candidate.id}`
  });
}

function buildReaderDocument(candidate) {
  return buildReaderPage(candidate).document;
}

function buildWaveContentManifest({ selection, entries, readerDocuments }) {
  const entriesByIdentity = new Map(
    entries.map((entry) => [identityKey(parseEntryIdentity(entry)), entry])
  );
  const sources = selection.candidates.map((candidate) => {
    const key = identityKey(candidate.identity);
    const readerPath = `src/content/tech-center${candidate.identity.canonicalPath}.md`;
    const readerDocument = readerDocuments.get(readerPath);
    if (!readerDocument) throw new Error(`Missing Wave 1 reader document for ${key}`);
    const entry = entriesByIdentity.get(key);
    if (!entry) throw new Error(`Missing Wave 1 registry entry for ${key}`);
    return {
      candidateId: candidate.id,
      identity: candidate.identity,
      operation: candidate.decision.operation,
      sourceUrl: candidate.provenance.sourceUrl,
      sourceSha256: candidate.provenance.sourceSha256,
      sourceBodySha256: candidate.provenance.bodySha256,
      evidence: {
        status: candidate.evidence.status,
        fingerprint: sanitizeReaderText(candidate.evidence.fingerprint),
        applicability: sanitizeReaderText(candidate.evidence.applicability)
      },
      securityStatus: candidate.security.status,
      operationRisk: candidate.operationRisk.level,
      readerPath,
      readerSha256: sha256(readerDocument),
      registryEntrySha256: sha256(stableJson(entry))
    };
  });
  const sourceSetSha256 = sha256(
    stableJson(
      sources.map((source) => ({
        candidateId: source.candidateId,
        identity: source.identity,
        sourceSha256: source.sourceSha256,
        sourceBodySha256: source.sourceBodySha256,
        readerSha256: source.readerSha256
      }))
    )
  );
  return {
    schemaVersion: 1,
    batch: 'week05',
    wave: WAVE_ID,
    status: 'source-verified',
    readerContentContract: READER_CONTENT_CONTRACT,
    sourceSetSha256,
    readerCount: sources.length,
    sources
  };
}

function buildWaveProjection({ authority, entries, selection }) {
  const candidateIds = selection.candidates.map((candidate) => candidate.id);
  const authorityProjection = projectAuthority(authority, {
    candidateIds,
    canonicalHost: PUBLIC_CANONICAL_HOST
  });
  const selectedKeys = new Set(
    selection.candidates.map((candidate) => identityKey(candidate.identity))
  );
  const registry = entries
    .filter((entry) => selectedKeys.has(identityKey(parseEntryIdentity(entry))))
    .map((entry) => ({
      identity: identityKey(parseEntryIdentity(entry)),
      ...entry
    }));
  if (registry.length !== candidateIds.length)
    throw new Error('Wave 1 registry identity count drift');
  const searchAll = buildSearchProjection(entries);
  const search = searchAll.filter((entry) => selectedKeys.has(entry.identity));
  const identities = authorityProjection.identities;
  const sitemap = identities.map((identity) => ({
    identity: identity.key,
    url: identity.canonical
  }));
  const staticExport = identities.map((identity) => ({
    identity: identity.key,
    path: identity.canonicalPath,
    reviewPath: identity.slug,
    canonical: identity.canonical,
    status: 200
  }));
  const releaseRecord = identities.map((identity) => ({
    candidateId: identity.candidateId,
    identity: identity.key,
    status: 'source-verified',
    sourceVerified: true,
    exportVerified: false,
    releaseEligible: false,
    publicationCount: 1
  }));
  const rollback = identities.map((identity) => ({
    candidateId: identity.candidateId,
    identity: identity.key,
    baselinePageCount: WAVE_BASELINE_PAGE_COUNT,
    action: 'remove-wave-1-projection',
    restore: WAVE_PUBLIC_SURFACES
  }));
  const acceptedAdd = selection.candidates.filter(
    (candidate) => candidate.decision.operation === 'add'
  ).length;
  const acceptedUpdate = selection.candidates.filter(
    (candidate) => candidate.decision.operation === 'update'
  ).length;
  const projection = {
    schemaVersion: 1,
    batch: 'week05',
    consistency: 'identity-set-verified',
    mode: 'publish',
    wave: WAVE_ID,
    governanceStatus: 'governance-complete',
    sourceVerified: true,
    exportVerified: false,
    releaseEligible: false,
    baselinePageCount: WAVE_BASELINE_PAGE_COUNT,
    acceptedCandidateCount: candidateIds.length,
    acceptedAdd,
    acceptedUpdate,
    publicPageDelta: acceptedAdd,
    publicationCount: candidateIds.length,
    resultingPageCount: WAVE_BASELINE_PAGE_COUNT + acceptedAdd,
    surfaces: WAVE_SURFACES,
    identities,
    registry,
    search,
    sitemap,
    staticExport,
    releaseRecord,
    rollback
  };
  verifyProjectionConsistency(projection);
  return projection;
}

function buildWaveRollback({ entries, search, projection }) {
  const selectedKeys = new Set(projection.identities.map((identity) => identity.key));
  const baselineEntries = entries.filter(
    (entry) => !selectedKeys.has(identityKey(parseEntryIdentity(entry)))
  );
  const baselineSearch = search.filter((entry) => !selectedKeys.has(entry.identity));
  const surfaceIdentitySets = Object.fromEntries(
    ['registry', 'search', 'sitemap', 'staticExport', 'releaseRecord', 'rollback'].map(
      (surface) => [
        surface,
        projection[surface].map((entry) =>
          typeof entry === 'string'
            ? entry
            : entry.identity || entry.key || entry.path || identityKey(entry)
        )
      ]
    )
  );
  return {
    schemaVersion: 1,
    batch: 'week05',
    wave: WAVE_ID,
    status: 'ready',
    baselinePageCount: WAVE_BASELINE_PAGE_COUNT,
    resultingPageCount: projection.resultingPageCount,
    waveIdentitySet: projection.identities.map((identity) => identity.key),
    publicSurfaces: WAVE_PUBLIC_SURFACES,
    surfaceIdentitySets,
    priorCompleteState: {
      registrySha256: sha256(stableJson(baselineEntries)),
      searchSha256: sha256(stableJson(baselineSearch)),
      projectionSha256: sha256(
        stableJson({ wave: 'wave-0', publicationCount: 0, pageCount: WAVE_BASELINE_PAGE_COUNT })
      )
    },
    rollbackAction: 'Restore every listed prior state together before serving the next export.',
    identities: projection.rollback
  };
}

function loadWaveInputs(repoRoot = path.resolve(__dirname, '../..')) {
  const authority = loadTechnicalAuthority(repoRoot);
  const entriesPath = path.join(repoRoot, REGISTRY_RELATIVE_PATH);
  const searchPath = path.join(repoRoot, SEARCH_RELATIVE_PATH);
  if (!fs.existsSync(entriesPath) || !fs.existsSync(searchPath)) {
    throw new Error('Wave 1 registry or search projection is missing');
  }
  return {
    authority,
    entries: JSON.parse(fs.readFileSync(entriesPath, 'utf8')),
    search: JSON.parse(fs.readFileSync(searchPath, 'utf8')),
    approvedSelection: loadWaveSelection(repoRoot)
  };
}

function readWaveArtifact(repoRoot, relativePath, label) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`${label} is missing: ${relativePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function verifyReaderDocument(repoRoot, source) {
  const filePath = path.join(repoRoot, source.readerPath);
  if (!fs.existsSync(filePath))
    throw new Error(`Wave 1 reader content is missing: ${source.readerPath}`);
  const document = fs.readFileSync(filePath, 'utf8');
  const expectedSlug = `/${source.identity.locale}${source.identity.canonicalPath}`;
  if (!document.includes(`slug: ${expectedSlug}`))
    throw new Error(`Wave 1 reader slug drift: ${expectedSlug}`);
  if (!document.includes(`source: ${source.sourceUrl}`))
    throw new Error(`Wave 1 reader source drift: ${expectedSlug}`);
  for (const heading of [
    '## 适用环境与版本范围',
    '## 问题指纹',
    '## 安全护栏',
    '## 回滚指引',
    '## 维护者证据'
  ]) {
    if (!document.includes(heading))
      throw new Error(`Wave 1 reader section missing: ${expectedSlug} ${heading}`);
  }
  if (!document.includes(`[FastGPT maintainer source](${source.sourceUrl})`)) {
    throw new Error(`Wave 1 public citation missing: ${expectedSlug}`);
  }
  if (containsCredentialShape(document))
    throw new Error(`Wave 1 reader contains credential-shaped output: ${expectedSlug}`);
  if (sha256(document) !== source.readerSha256)
    throw new Error(`Wave 1 reader SHA-256 drift: ${expectedSlug}`);
  return document;
}

function verifyWaveSource(repoRoot = path.resolve(__dirname, '../..')) {
  const { authority, entries, search, approvedSelection } = loadWaveInputs(repoRoot);
  validateTechnicalAuthority(authority, { repoRoot, verifyHistory: true, verifyArtifacts: true });
  verifyPersistedArtifacts(authority, repoRoot);
  if (authority.projection.wave !== 'wave-0' || authority.projection.publicationCount !== 0) {
    throw new Error('Wave 0 baseline must remain a zero-publication projection');
  }
  const manifest = readWaveArtifact(repoRoot, WAVE_MANIFEST_RELATIVE_PATH, 'Wave 1 manifest');
  const content = readWaveArtifact(repoRoot, WAVE_CONTENT_RELATIVE_PATH, 'Wave 1 content manifest');
  const projection = readWaveArtifact(repoRoot, WAVE_PROJECTION_RELATIVE_PATH, 'Wave 1 projection');
  const rollback = readWaveArtifact(
    repoRoot,
    WAVE_ROLLBACK_RELATIVE_PATH,
    'Wave 1 rollback artifact'
  );
  const releaseManifest = readWaveArtifact(
    repoRoot,
    WAVE_RELEASE_MANIFEST_RELATIVE_PATH,
    'Wave 1 release manifest'
  );
  const selection = chooseWaveCandidates(authority, entries, approvedSelection);
  if (
    manifest.wave !== WAVE_ID ||
    manifest.selection?.selectedCount !== selection.candidates.length
  ) {
    throw new Error('Wave 1 selection manifest drift');
  }
  if (
    JSON.stringify(manifest.selection.candidateIds) !==
    JSON.stringify(selection.candidates.map((candidate) => candidate.id))
  ) {
    throw new Error('Wave 1 candidate identity selection drift');
  }
  if (
    manifest.selection.eligibleCount !== selection.eligibleCount ||
    JSON.stringify(manifest.selection.criteria) !== JSON.stringify(selection.criteria) ||
    JSON.stringify(manifest.selection.topics) !== JSON.stringify(selection.topics) ||
    JSON.stringify(manifest.selection.approval) !== JSON.stringify(selection.approval)
  ) {
    throw new Error('Wave 1 approved selection provenance drift');
  }
  if (
    manifest.baseline?.wave !== 'wave-0' ||
    manifest.baseline.pageCount !== WAVE_BASELINE_PAGE_COUNT ||
    manifest.baseline.publicationCount !== 0
  ) {
    throw new Error('Wave 1 historical baseline drift');
  }
  const expectedCounts = {
    baselinePageCount: WAVE_BASELINE_PAGE_COUNT,
    acceptedCandidateCount: selection.candidates.length,
    acceptedAdd: selection.candidates.filter((candidate) => candidate.decision.operation === 'add')
      .length,
    acceptedUpdate: selection.candidates.filter(
      (candidate) => candidate.decision.operation === 'update'
    ).length,
    publicPageDelta: selection.candidates.filter(
      (candidate) => candidate.decision.operation === 'add'
    ).length,
    resultingPageCount:
      WAVE_BASELINE_PAGE_COUNT +
      selection.candidates.filter((candidate) => candidate.decision.operation === 'add').length
  };
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (manifest.counts?.[key] !== expected)
      throw new Error(`Wave 1 count invariant drift: ${key}`);
  }
  if (entries.length !== WAVE_BASELINE_PAGE_COUNT + manifest.counts.acceptedAdd) {
    throw new Error('Wave 1 registry count does not equal baseline plus accepted add');
  }
  if (search.length !== entries.length) throw new Error('Wave 1 search count drift');
  const expectedSearch = buildSearchProjection(entries);
  if (JSON.stringify(search) !== JSON.stringify(expectedSearch))
    throw new Error('Wave 1 search projection drift');
  const expectedProjection = buildWaveProjection({ authority, entries, selection });
  if (JSON.stringify(projection) !== JSON.stringify(expectedProjection)) {
    throw new Error('Wave 1 deterministic projection drift');
  }
  verifyProjectionConsistency(projection);
  const waveKeys = new Set(projection.identities.map((identity) => identity.key));
  const contentSources = content.sources;
  if (
    content.readerCount !== selection.candidates.length ||
    contentSources.length !== selection.candidates.length
  ) {
    throw new Error('Wave 1 reader content count drift');
  }
  if (
    JSON.stringify(contentSources.map((source) => source.candidateId)) !==
    JSON.stringify(selection.candidates.map((candidate) => candidate.id))
  ) {
    throw new Error('Wave 1 reader content identity set drift');
  }
  if (JSON.stringify(content.readerContentContract) !== JSON.stringify(READER_CONTENT_CONTRACT)) {
    throw new Error('Wave 1 reader content contract drift');
  }
  contentSources.forEach((source) => {
    if (!waveKeys.has(`${source.identity.locale}|${source.identity.canonicalPath}`)) {
      throw new Error(`Wave 1 reader identity is outside the projection: ${source.candidateId}`);
    }
    if (containsCredentialShape(source.evidence.fingerprint)) {
      throw new Error(
        `Wave 1 content manifest contains credential-shaped evidence: ${source.candidateId}`
      );
    }
  });
  contentSources.forEach((source) => verifyReaderDocument(repoRoot, source));
  const contentDigest = sha256(stableJson(content));
  if (manifest.content.sha256 !== contentDigest)
    throw new Error('Wave 1 content manifest SHA-256 drift');
  if (content.sourceSetSha256 !== manifest.provenance?.sourceSetSha256) {
    throw new Error('Wave 1 provenance source-set SHA-256 drift');
  }
  if (manifest.projection.sha256 !== sha256(stableJson(projection)))
    throw new Error('Wave 1 projection SHA-256 drift');
  if (manifest.rollback.sha256 !== sha256(stableJson(rollback)))
    throw new Error('Wave 1 rollback SHA-256 drift');
  if (
    rollback.waveIdentitySet.length !== waveKeys.size ||
    rollback.waveIdentitySet.some((key) => !waveKeys.has(key))
  ) {
    throw new Error('Wave 1 rollback identity set drift');
  }
  for (const surface of WAVE_SURFACES) {
    const expectedSurfaceKeys = projection[surface].map((entry) =>
      typeof entry === 'string'
        ? entry
        : entry.identity || entry.key || entry.path || identityKey(entry)
    );
    if (
      JSON.stringify(rollback.surfaceIdentitySets?.[surface]) !==
      JSON.stringify(expectedSurfaceKeys)
    ) {
      throw new Error(`Wave 1 rollback surface identity drift: ${surface}`);
    }
  }
  const expectedRollback = buildWaveRollback({ entries, search, projection });
  if (JSON.stringify(rollback) !== JSON.stringify(expectedRollback))
    throw new Error('Wave 1 rollback artifact drift');
  const expectedArtifactPaths = [
    REGISTRY_RELATIVE_PATH,
    SEARCH_RELATIVE_PATH,
    WAVE_CONTENT_RELATIVE_PATH,
    WAVE_MANIFEST_RELATIVE_PATH,
    WAVE_PROJECTION_RELATIVE_PATH,
    WAVE_ROLLBACK_RELATIVE_PATH
  ].sort();
  if (
    JSON.stringify(releaseManifest.artifacts.map((artifact) => artifact.path).sort()) !==
    JSON.stringify(expectedArtifactPaths)
  ) {
    throw new Error('Wave 1 release manifest artifact set drift');
  }
  if (
    releaseManifest.wave !== WAVE_ID ||
    releaseManifest.status !== 'source-verified' ||
    releaseManifest.writeStrategy !== 'rollback-on-error' ||
    releaseManifest.postWriteVerification !== 'required' ||
    releaseManifest.sourceSetSha256 !== content.sourceSetSha256
  ) {
    throw new Error('Wave 1 release manifest verification state drift');
  }
  releaseManifest.artifacts.forEach((artifact) => {
    assertDigest(artifact.sha256, `Wave 1 release artifact ${artifact.path}`);
    const artifactPath = path.join(repoRoot, artifact.path);
    if (!fs.existsSync(artifactPath) || fileSha256(artifactPath) !== artifact.sha256) {
      throw new Error(`Wave 1 release artifact SHA-256 drift: ${artifact.path}`);
    }
  });
  return {
    wave: WAVE_ID,
    selectedCount: selection.candidates.length,
    acceptedAdd: manifest.counts.acceptedAdd,
    acceptedUpdate: manifest.counts.acceptedUpdate,
    baselinePageCount: manifest.counts.baselinePageCount,
    resultingPageCount: manifest.counts.resultingPageCount,
    topicCount: selection.topicCount,
    sourceVerified: true,
    exportVerified: false,
    releaseEligible: false
  };
}

function resolveStaticHtml(outDir, route) {
  const relative = route.replace(/^\/+|\/+$/g, '');
  const candidates = [
    path.join(outDir, `${relative}.html`),
    path.join(outDir, relative, 'index.html')
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function verifyWaveExport(repoRoot, { outDir, variant = 'cn' } = {}) {
  const source = verifyWaveSource(repoRoot);
  if (!outDir) throw new Error('Wave 1 export verification requires --out-dir');
  const projection = readWaveArtifact(repoRoot, WAVE_PROJECTION_RELATIVE_PATH, 'Wave 1 projection');
  const baseUrl = PUBLIC_CANONICAL_HOST;
  const sitemapPath = path.join(outDir, 'sitemap.xml');
  const sitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, 'utf8') : '';
  projection.identities.forEach((identity) => {
    const canonicalRoute = identity.canonicalPath;
    const reviewRoute = identity.slug;
    if (variant === 'io') {
      if (resolveStaticHtml(outDir, canonicalRoute) || resolveStaticHtml(outDir, reviewRoute)) {
        throw new Error(`IO export contains Wave 1 route: ${canonicalRoute}`);
      }
      return;
    }
    const route = variant === 'preview' ? reviewRoute : canonicalRoute;
    const htmlPath = resolveStaticHtml(outDir, route);
    if (!htmlPath) throw new Error(`Missing Wave 1 ${variant} HTML: ${route}`);
    const html = fs.readFileSync(htmlPath, 'utf8');
    const canonicalPattern = new RegExp(
      `<link\\b[^>]*\\brel=["']canonical["'][^>]*\\bhref=["']${baseUrl}${canonicalRoute}["']`,
      'i'
    );
    if (!canonicalPattern.test(html)) {
      throw new Error(`Wave 1 ${variant} canonical drift: ${route}`);
    }
    if (!html.includes('FastGPT maintainer source'))
      throw new Error(`Wave 1 citation missing in export: ${route}`);
    if (variant === 'cn' && !sitemap.includes(`<loc>${baseUrl}${canonicalRoute}</loc>`)) {
      throw new Error(`Wave 1 sitemap missing: ${canonicalRoute}`);
    }
  });
  return { ...source, exportVerified: true, releaseEligible: true, variant };
}

module.exports = {
  PUBLIC_CANONICAL_HOST,
  REGISTRY_RELATIVE_PATH,
  SEARCH_RELATIVE_PATH,
  WAVE_BASELINE_PAGE_COUNT,
  WAVE_CONTENT_RELATIVE_PATH,
  WAVE_ID,
  WAVE_MANIFEST_RELATIVE_PATH,
  WAVE_MAX_CANDIDATES,
  WAVE_MIN_CANDIDATES,
  WAVE_SELECTION_RELATIVE_PATH,
  WAVE_PROJECTION_RELATIVE_PATH,
  WAVE_RELEASE_MANIFEST_RELATIVE_PATH,
  WAVE_ROLLBACK_RELATIVE_PATH,
  WAVE_PUBLIC_SURFACES,
  WAVE_SURFACES,
  buildReaderDocument,
  buildReaderPage,
  buildWaveContentManifest,
  buildWaveProjection,
  buildWaveRollback,
  chooseWaveCandidates,
  containsCredentialShape,
  loadWaveSelection,
  loadWaveInputs,
  sanitizeReaderText,
  verifyWaveExport,
  verifyWaveSource
};
