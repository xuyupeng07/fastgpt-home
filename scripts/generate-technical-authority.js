#!/usr/bin/env node

/** Generate the committed Week05 technical authority from the supplied delivery workbook. */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const {
  AUTHORITY_RELATIVE_PATH,
  DISPOSITION_LEDGER_RELATIVE_PATH,
  DUPLICATE_LEDGER_RELATIVE_PATH,
  IDENTITY_LEDGER_RELATIVE_PATH,
  OPERATION_RISK_LEDGER_RELATIVE_PATH,
  PROJECTION_RELATIVE_PATH,
  PROVENANCE_RELATIVE_PATH,
  RELEASE_MANIFEST_RELATIVE_PATH,
  SECURITY_LEDGER_RELATIVE_PATH,
  projectAuthority
} = require('./lib/technical-authority');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE = process.env.FASTGPT_WEEK05_SOURCE;
const HISTORICAL_MANIFEST = 'src/content/tech-center/authority/import-manifest.json';
const HISTORICAL_LEDGER = 'src/content/tech-center/authority/decision-ledger.json';
const KNOWN_CONFLICTS = new Set([
  'fastgpt-plugin-s3-connection-refused',
  'fastgpt-private-deployment-error',
  'fastgpt-private-deployment-troubleshooting',
  'fastgpt-troubleshooting-guide'
]);
const D0_SLUGS = new Set([
  'fastgpt-master-build-copy-error',
  'fastgpt-docker-deploy-ui-unavailable',
  'fastgpt-docker-port-fix',
  'wsl-fastgpt-deployment-troubleshooting',
  'fastgpt-private-mysql-start-fail'
]);
const D1_SLUGS = new Set([
  'fastgpt-build-discrepancy-server',
  'fastgpt-docker-build-tiktoken-error',
  'fastgpt-pnpm-dev-usememo-error',
  'fastgpt-pg-hostname-resolve-error'
]);
const D2_SLUGS = new Set([
  'fastgpt-local-start-heat-update-path-error',
  'fastgpt-private-blank-page-troubleshooting'
]);
const REDACTED_CREDENTIAL_FILES = new Set([
  'troubleshoot/bge-rerank-v2-m3-docker-gpu-fix.md',
  'troubleshoot/fastgpt-custom-key-troubleshooting.md',
  'troubleshoot/fastgpt-image-download-failed.md',
  'troubleshoot/fastgpt-local-image-timeout-fix.md',
  'troubleshoot/fastgpt-pdf-parse-connection-refused.md',
  'troubleshoot/fastgpt-rerank-container-error-restart.md',
  'troubleshoot/fastgpt-speech-recognition-timeout.md',
  'troubleshoot/fastgpt-support-completions-api.md',
  'troubleshoot/fastgpt-third-party-voice-model-error.md',
  'troubleshoot/fastgpt-upgrade-db-start-troubleshooting.md',
  'troubleshoot/fastgpt-workflow-url-missing-ip-port.md'
]);
const UNRESOLVED_CREDENTIAL_FILES = new Set([
  'troubleshoot/fastgpt-api-error-troubleshooting.md',
  'troubleshoot/fastgpt-chat-completions-error.md'
]);
const RELATION_SPECS = [
  [4023, 4031],
  [1108, 1109],
  [5481, 5483],
  [2204, 396],
  [1499, 1572],
  [3214, 981],
  [3546, 3765],
  [1662, 2425],
  [1782, 1863]
];
const RELATION_DECISIONS = {
  '4023-4031': {
    resolution: 'merged',
    winnerIssue: 4023,
    resolutionReason:
      '4031 merged into 4023; the retained candidate remains denied pending root-cause evidence.'
  },
  '1108-1109': {
    resolution: 'denied',
    resolutionReason: 'Both candidates lack a confirmed cause and standard repair evidence.'
  },
  '5481-5483': {
    resolution: 'merged',
    winnerIssue: 5481,
    resolutionReason:
      '5483 merged into 5481; the retained candidate remains denied pending configuration evidence.'
  },
  '2204-396': {
    resolution: 'distinct',
    resolutionReason:
      'The candidates describe distinct request states and retain separate identities.'
  },
  '1499-1572': {
    resolution: 'denied',
    resolutionReason: 'The candidates remain unresolved without formal version or commit evidence.'
  },
  '3214-981': {
    resolution: 'distinct',
    resolutionReason: 'Dataset-process and browser-environment failures have distinct causes.'
  },
  '3546-3765': {
    resolution: 'distinct',
    resolutionReason:
      'Tool-calling integration and general model configuration are distinct intents.'
  },
  '1662-2425': {
    resolution: 'distinct',
    resolutionReason:
      'Image compatibility and InnoDB corruption require separate remediation paths.'
  },
  '1782-1863': {
    resolution: 'denied',
    resolutionReason: 'Both candidates lack a verified root cause and repair path.'
  }
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function zipEntries(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd === -1) throw new Error('Invalid XLSX source: ZIP end record is missing');
  const count = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let offset = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new Error('Invalid XLSX central directory');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    const localNameLength = buffer.readUInt16LE(entry.localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(entry.localOffset + 28);
    const start = entry.localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return compressed;
    if (entry.method === 8) return zlib.inflateRawSync(compressed);
    throw new Error(`Unsupported XLSX compression method ${entry.method}`);
  };
}

function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function readXmlRows(xml) {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(([, body]) => {
    const values = {};
    for (const match of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = match[1];
      const content = match[2] || '';
      const cell = attributes.match(/\br="([^"]+)"/);
      if (!cell) continue;
      const column = cell[1].replace(/\d+$/, '');
      const text = content.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      const numeric = content.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      values[column] = decodeXml(text ?? numeric ?? '').trim();
    }
    return values;
  });
}

function readWorkbook(sourceDirectory) {
  const workbookPath = fs
    .readdirSync(sourceDirectory)
    .map((name) => path.join(sourceDirectory, name))
    .find((filePath) => filePath.toLowerCase().endsWith('.xlsx'));
  if (!workbookPath) throw new Error(`No Week05 technical workbook found in ${sourceDirectory}`);
  const getEntry = zipEntries(fs.readFileSync(workbookPath));
  const rows = readXmlRows(getEntry('xl/worksheets/sheet1.xml').toString('utf8'));
  const headers = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const expected = [
    '序号',
    '页型',
    'URL 路径(中文站)',
    '标题',
    '字数',
    '来源类型',
    '来源链接',
    'md 文件'
  ];
  if (headers.some((column, index) => rows[0]?.[column] !== expected[index])) {
    throw new Error('Week05 technical workbook headers changed');
  }
  return {
    path: workbookPath,
    sha256: sha256(fs.readFileSync(workbookPath)),
    records: rows.slice(1).map((row, index) => ({
      row: index + 2,
      category: row.B,
      slug: row.C,
      title: row.D,
      wordCount: Number(row.E),
      sourceType: row.F,
      sourceUrl: row.G,
      sourceFile: row.H
    }))
  };
}

function normalizeIdentity(slug) {
  const match = slug.match(/^\/([^/]+)(\/.*)$/);
  if (!match) throw new Error(`Invalid Week05 candidate slug ${slug}`);
  return {
    locale: match[1].normalize('NFKC').toLowerCase(),
    canonicalPath: match[2].normalize('NFKC').toLowerCase()
  };
}

function readFrontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  const metadata = {};
  for (const line of match?.[1]?.split('\n') || []) {
    const separator = line.indexOf(':');
    if (separator !== -1)
      metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return metadata;
}

function fingerprint(source, title) {
  const section = source.match(/##\s*(?:现象|Error|Problem)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i)?.[1];
  return (section || title).replace(/\s+/g, ' ').trim().slice(0, 240);
}

function redactCredentialShapes(value) {
  return value
    .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/gi, '[REDACTED_CREDENTIAL]')
    .replace(
      /\bfastgpt-(?=[A-Za-z0-9_-]{9,}\b)(?=[A-Za-z0-9_-]*[A-Z])[A-Za-z0-9][A-Za-z0-9_-]*\b/g,
      '[REDACTED_CREDENTIAL]'
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, 'Bearer [REDACTED_CREDENTIAL]')
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, '[REDACTED_CREDENTIAL]')
    .replace(
      /([?&](?:token|key|secret|api[_-]?key|access[_-]?token)=)[^&\s)`]+/gi,
      '$1[REDACTED_CREDENTIAL]'
    )
    .replace(
      /(\b(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/)[^\s`:@]+:[^\s`@]+@/gi,
      '$1[REDACTED_CREDENTIAL]:[REDACTED_CREDENTIAL]@'
    )
    .replace(
      /((?:api[_-]?key|access[_-]?token|authorization|password|secret)\s*[:=]\s*["']?)([^\s,"'`}]+)/gi,
      '$1[REDACTED_CREDENTIAL]'
    );
}

function sourceBody(sourceDirectory, record) {
  const root = path.resolve(sourceDirectory);
  const filePath = path.resolve(root, record.sourceFile);
  const relative = path.relative(root, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Week05 technical source escapes the delivery directory: ${record.sourceFile}`);
  }
  if (!fs.existsSync(filePath))
    throw new Error(`Missing Week05 technical source ${record.sourceFile}`);
  return fs.readFileSync(filePath, 'utf8');
}

function issueId(sourceUrl) {
  return Number(sourceUrl.match(/\/issues\/(\d+)$/)?.[1] || 0);
}

function operationMatches(source) {
  const patterns = [
    ['docker-volume-removal', /docker(?:[- ]compose)?\s+down[^\n`]*-v/gi],
    ['docker-system-prune', /docker\s+system\s+prune/gi],
    ['docker-builder-prune', /docker\s+builder\s+prune/gi],
    ['recursive-delete', /rm\s+-rf[^\n`]*/gi],
    ['persistent-data-delete', /删除[^\n`]*(?:持久化数据目录|数据库目录|数据卷|数据目录)/gi],
    ['lockfile-delete', /(?:rm\s+-rf|删除)[^\n`]*(?:pnpm-lock|package-lock|yarn\.lock|lockfile)/gi],
    ['cache-delete', /(?:rm\s+-rf|删除)[^\n`]*(?:\.next|缓存)/gi],
    ['credential-file-delete', /删除[^\n`]*(?:密钥文件|密钥相关文件|private_key)/gi],
    ['permission-change', /(?:chmod|chown)\s+[^\n`]*/gi]
  ];
  const findings = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((line, lineIndex) => {
    patterns.forEach(([kind, pattern]) => {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        findings.push({ kind, line: lineIndex + 1, raw: match[0].trim() });
      }
    });
  });
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.kind}|${finding.line}|${finding.raw}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function riskLevelForFindings(slug, findings) {
  if (D0_SLUGS.has(slug)) return 'D0';
  if (D1_SLUGS.has(slug)) return 'D1';
  if (D2_SLUGS.has(slug)) return 'D2';
  if (
    findings.some((finding) =>
      ['docker-system-prune', 'persistent-data-delete', 'docker-volume-removal'].includes(
        finding.kind
      )
    )
  ) {
    return 'D0';
  }
  if (
    findings.some((finding) =>
      [
        'docker-builder-prune',
        'recursive-delete',
        'lockfile-delete',
        'credential-file-delete',
        'permission-change'
      ].includes(finding.kind)
    )
  ) {
    return 'D1';
  }
  if (findings.some((finding) => finding.kind === 'cache-delete')) return 'D2';
  return 'none';
}

function buildRisk(slug, source, sourceUrl, sourceFile) {
  const scannedFindings = operationMatches(source);
  const level = riskLevelForFindings(slug, scannedFindings);
  const safeguards = {
    none: {
      warning: 'No destructive operation identified in the candidate.',
      prerequisite: 'Confirm the documented environment and version before review.',
      rollback: 'Revert the documentation projection to the prior authority snapshot.',
      decision: 'review'
    },
    D0: {
      warning: 'The proposed operation can affect persistent build or database state.',
      prerequisite: 'Require a backup, a scoped diagnostic, and an approved recovery runbook.',
      rollback: 'Restore the verified backup and remove the proposed operation from publication.',
      decision: 'denied'
    },
    D1: {
      warning: 'The operation can affect a bounded deployment or service resource.',
      prerequisite: 'Limit the command to the named workspace and confirm a recent backup.',
      rollback: 'Restore the prior image or configuration and rerun the bounded verification.',
      decision: 'needs-evidence'
    },
    D2: {
      warning: 'The operation targets a reproducible cache or generated runtime artifact.',
      prerequisite: 'Confirm the target is regenerable and record the rebuild command.',
      rollback: 'Rebuild the cache or generated artifact from the pinned source revision.',
      decision: 'needs-evidence'
    }
  };
  return {
    level,
    ...safeguards[level],
    findings: scannedFindings.map((finding) => ({
      kind: finding.kind,
      location: { sourceFile, line: finding.line },
      fingerprint: sha256(finding.raw),
      evidence: sourceUrl,
      disposition: level === 'none' ? 'cleared' : 'denied'
    }))
  };
}

function credentialMatches(source) {
  const patterns = [
    ['generic-sk-token', /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/gi],
    [
      'fastgpt-token',
      /\bfastgpt-(?=[A-Za-z0-9_-]{9,}\b)(?=[A-Za-z0-9_-]*[A-Z])[A-Za-z0-9][A-Za-z0-9_-]*\b/g
    ],
    ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi],
    ['jwt', /\beyJ[A-Za-z0-9._-]{20,}\b/g],
    [
      'credential-assignment',
      /\b(?:api[_-]?key|access[_-]?token|chat_api_key|token_key|password|secret)\s*[:=]\s*["'`]?[^\s,"'`}]+/gi
    ],
    ['credential-query', /[?&](?:token|key|secret|api[_-]?key|access[_-]?token)=[^&\s)`]+/gi],
    ['cloud-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['credential-dsn', /\b(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s`]+/gi],
    ['auth-header', /\b(?:Authorization|X-[A-Za-z0-9-]*(?:Token|Key))\s*[:=]\s*[^\s,;`)]+/gi]
  ];
  const lines = source.split(/\r?\n/);
  const matches = [];
  lines.forEach((line, lineIndex) => {
    patterns.forEach(([kind, pattern]) => {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        matches.push({ kind, line: lineIndex + 1, raw: match[0] });
      }
    });
  });
  const seen = new Set();
  return matches.filter((match) => {
    const key = `${match.kind}|${match.line}|${match.raw}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isPlaceholder(value) {
  return /\[REDACTED|YOUR_|<[^>]+>|\[[^\]]+\]|\b(?:xxx+|xxxx+|mytoken|123456|sk-fastgpt|sk-tarzan)\b|\$\{/i.test(
    value
  );
}

function buildSecurity(source, record) {
  const matches = credentialMatches(source);
  if (!matches.length) return { status: 'clear', findings: [] };
  const findings = matches.map((match) => {
    const isEmptyBearer = /(?:authorization\s*[:=]\s*bearer|bearer)\s*$/i.test(match.raw);
    const status = UNRESOLVED_CREDENTIAL_FILES.has(record.sourceFile)
      ? 'needs-review'
      : isEmptyBearer
      ? 'clear'
      : REDACTED_CREDENTIAL_FILES.has(record.sourceFile)
      ? 'redacted-secret'
      : isPlaceholder(match.raw)
      ? 'approved-synthetic-placeholder'
      : 'redacted-secret';
    const disposition =
      status === 'needs-review' ? 'denied' : status === 'clear' ? 'cleared' : 'redacted';
    return {
      kind: match.kind,
      location: { sourceFile: record.sourceFile, line: match.line },
      fingerprint: sha256(redactCredentialShapes(match.raw)),
      disposition,
      reviewer: 'technical-governance',
      evidence: record.sourceUrl,
      replacement:
        status === 'needs-review'
          ? 'Denied before publication; source value remains outside all public projections.'
          : disposition === 'cleared'
          ? 'No credential value present; no replacement required.'
          : status === 'approved-synthetic-placeholder'
          ? 'YOUR_API_KEY'
          : '[REDACTED_CREDENTIAL]'
    };
  });
  const statuses = new Set(
    findings.map((finding) =>
      finding.disposition === 'denied'
        ? 'needs-review'
        : finding.disposition === 'cleared'
        ? 'clear'
        : finding.replacement === 'YOUR_API_KEY'
        ? 'approved-synthetic-placeholder'
        : 'redacted-secret'
    )
  );
  const status = statuses.has('needs-review')
    ? 'needs-review'
    : statuses.has('redacted-secret')
    ? 'redacted-secret'
    : statuses.has('approved-synthetic-placeholder')
    ? 'approved-synthetic-placeholder'
    : 'clear';
  return { status, findings };
}

function buildEvidence(source, record) {
  const metadata = readFrontMatter(source);
  return {
    status: 'verified',
    sources: [record.sourceUrl],
    fingerprint: redactCredentialShapes(fingerprint(source, record.title)),
    applicability: metadata.slug
      ? `${metadata.slug} environment and version scope`
      : 'FastGPT deployment environment described by the maintainer source'
  };
}

function historyForRepository() {
  const manifestPath = path.join(ROOT, HISTORICAL_MANIFEST);
  const ledgerPath = path.join(ROOT, HISTORICAL_LEDGER);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  return {
    accepted: 454,
    denied: 6,
    add: 450,
    update: 4,
    pageCount: 1122,
    manifestPath: HISTORICAL_MANIFEST,
    ledgerPath: HISTORICAL_LEDGER,
    manifestSha256: sha256(fs.readFileSync(manifestPath)),
    ledgerSha256: sha256(fs.readFileSync(ledgerPath)),
    acceptedDigest: sha256(
      stableJson(
        manifest.pages.map((page) => ({ identity: page.identity, operation: page.operation }))
      )
    ),
    deniedDigest: sha256(stableJson(ledger.denials.map((denial) => denial.identity)))
  };
}

function buildAuthority(sourceDirectory) {
  const workbook = readWorkbook(sourceDirectory);
  if (workbook.records.length !== 888)
    throw new Error(`Expected 888 Week05 records, found ${workbook.records.length}`);
  const byIssue = new Map();
  const candidates = workbook.records.map((record, index) => {
    const source = sourceBody(sourceDirectory, record);
    const identity = normalizeIdentity(record.slug);
    const slug = path.posix.basename(identity.canonicalPath);
    const candidate = {
      id: `week05-${String(index + 1).padStart(4, '0')}`,
      identity,
      title: record.title,
      category: identity.canonicalPath.split('/')[1],
      sourceType: record.sourceType,
      provenance: {
        workbook: path.basename(workbook.path),
        workbookSha256: workbook.sha256,
        workbookRow: record.row,
        sourceFile: record.sourceFile,
        sourceUrl: record.sourceUrl,
        sourceSha256: sha256(source),
        bodySha256: sha256(source)
      },
      evidence: buildEvidence(source, record),
      security: buildSecurity(source, record),
      operationRisk: buildRisk(slug, source, record.sourceUrl, record.sourceFile),
      relations: [],
      state: 'needs-evidence',
      decision: null
    };
    byIssue.set(issueId(record.sourceUrl), candidate.id);
    return candidate;
  });

  const relations = RELATION_SPECS.map(([leftIssue, rightIssue]) => {
    const relatedCandidateIds = [byIssue.get(leftIssue), byIssue.get(rightIssue)];
    if (relatedCandidateIds.some((candidateId) => !candidateId)) {
      throw new Error(`Week05 duplicate relation is missing issue ${leftIssue}/${rightIssue}`);
    }
    const relationDecision = RELATION_DECISIONS[`${leftIssue}-${rightIssue}`];
    const winnerCandidateId = relationDecision.winnerIssue
      ? byIssue.get(relationDecision.winnerIssue)
      : undefined;
    return {
      id: `issue-${leftIssue}-${rightIssue}`,
      resolution: relationDecision.resolution,
      resolutionReason: relationDecision.resolutionReason,
      ...(winnerCandidateId ? { winnerCandidateId } : {}),
      relatedCandidateIds,
      evidence: `https://github.com/labring/FastGPT/issues/${leftIssue} and https://github.com/labring/FastGPT/issues/${rightIssue}`
    };
  });
  const relationsByCandidate = new Map();
  for (const relation of relations) {
    for (const candidateId of relation.relatedCandidateIds) {
      const list = relationsByCandidate.get(candidateId) || [];
      list.push(relation);
      relationsByCandidate.set(candidateId, list);
    }
  }
  candidates.forEach((candidate) => {
    candidate.relations = relationsByCandidate.get(candidate.id) || [];
  });

  const identityConflicts = candidates
    .filter((candidate) =>
      KNOWN_CONFLICTS.has(path.posix.basename(candidate.identity.canonicalPath))
    )
    .map((candidate) => ({
      id: `identity-conflict-${candidate.id}`,
      candidateId: candidate.id,
      existingIdentity: candidate.identity,
      resolution: 'denied',
      reason: 'existing-identity-collision',
      evidence: `https://fastgpt.cn${candidate.identity.canonicalPath}`
    }));

  const conflictCandidateIds = new Set(identityConflicts.map((conflict) => conflict.candidateId));
  const relationByCandidate = new Map();
  relations.forEach((relation) => {
    relation.relatedCandidateIds.forEach((candidateId) => {
      const list = relationByCandidate.get(candidateId) || [];
      list.push(relation);
      relationByCandidate.set(candidateId, list);
    });
  });
  const governanceEligible = candidates.filter(
    (candidate) =>
      !conflictCandidateIds.has(candidate.id) &&
      !candidate.relations.some((relation) => relation.resolution !== 'distinct') &&
      candidate.operationRisk.level === 'none' &&
      candidate.security.status !== 'needs-review' &&
      candidate.evidence.status === 'verified' &&
      candidate.evidence.fingerprint.length >= 24
  );
  const acceptedIds = new Set(governanceEligible.map((candidate) => candidate.id));
  candidates.forEach((candidate) => {
    const relation = relationByCandidate.get(candidate.id)?.[0];
    const conflict = conflictCandidateIds.has(candidate.id);
    const unresolvedCredential = candidate.security.status === 'needs-review';
    const risk = candidate.operationRisk.level;
    let reason = 'Evidence quality is insufficient for technical governance acceptance.';
    if (conflict) reason = 'existing-identity-collision';
    else if (unresolvedCredential) reason = 'credential-review-unresolved';
    else if (risk !== 'none') reason = `operation-risk-${risk}`;
    else if (relation?.resolution === 'merged') reason = 'merged-into-retained-candidate';
    else if (relation?.resolution === 'denied') reason = 'duplicate-evidence-insufficient';
    else if (relation?.resolution === 'distinct') reason = 'high-similarity-review-held';
    if (acceptedIds.has(candidate.id)) {
      candidate.state = 'accepted';
      candidate.decision = {
        disposition: 'accepted',
        operation: 'add',
        reason:
          'Source, identity, evidence fingerprint, security, and operation-risk governance gates passed.',
        evidence: [candidate.provenance.sourceUrl],
        reviewer: 'technical-governance'
      };
      return;
    }
    candidate.state = 'denied';
    candidate.decision = {
      disposition: 'denied',
      reason,
      evidence: [candidate.provenance.sourceUrl],
      reviewer: 'technical-governance'
    };
    if (relation?.resolution === 'merged' && relation.winnerCandidateId === candidate.id) {
      candidate.decision.reason =
        'Retained identity remains denied until the merged evidence set proves root cause and repair.';
    }
  });
  const finalAccepted = candidates
    .filter((candidate) => candidate.state === 'accepted')
    .map((candidate) => candidate.id);
  const finalDenied = candidates
    .filter((candidate) => candidate.state === 'denied')
    .map((candidate) => candidate.id);
  const add = finalAccepted.filter(
    (candidateId) =>
      candidates.find((candidate) => candidate.id === candidateId).decision.operation === 'add'
  ).length;
  const update = finalAccepted.length - add;
  const securityFindings = candidates.reduce(
    (count, candidate) => count + candidate.security.findings.length,
    0
  );
  const operationFindings = candidates.reduce(
    (count, candidate) => count + candidate.operationRisk.findings.length,
    0
  );
  const authority = {
    schemaVersion: 1,
    batch: {
      id: 'week05',
      status: 'closed',
      candidateCount: 888,
      source: 'Week05 technical delivery',
      closure: {
        status: 'governance-complete',
        wave: 'wave-0',
        publicationCount: 0,
        reviewer: 'technical-governance'
      }
    },
    history: historyForRepository(),
    candidates,
    relations,
    identityConflicts,
    final: { accepted: finalAccepted, denied: finalDenied },
    temporary: { needsEvidence: [], deferred: [] },
    counts: {
      accepted: finalAccepted.length,
      denied: finalDenied.length,
      add,
      update,
      resultingPageCount: 1122 + add
    },
    projection: {
      schemaVersion: 1,
      mode: 'dry-run',
      publicPageDelta: 0,
      publicationCount: 0,
      governanceStatus: 'governance-complete',
      wave: 'wave-0',
      resultingPageCount: 1122 + add,
      tracerCandidateId: finalAccepted[0],
      surfaces: ['registry', 'search', 'sitemap', 'static-export', 'release-record', 'rollback'],
      acceptedCandidateCount: finalAccepted.length,
      artifactPath: PROJECTION_RELATIVE_PATH
    },
    governance: {
      status: 'governance-complete',
      wave: 'wave-0',
      candidateCount: candidates.length,
      finalAcceptedCount: finalAccepted.length,
      finalDeniedCount: finalDenied.length,
      temporaryCount: 0,
      identityConflictCount: identityConflicts.length,
      duplicateRelationCount: relations.length,
      resolvedRelationCount: relations.filter(
        (relation) => relation.resolution !== 'pending-review'
      ).length,
      credentialFindingCount: securityFindings,
      unresolvedCredentialCount: candidates.filter(
        (candidate) =>
          candidate.security.status === 'needs-review' &&
          candidate.decision?.disposition !== 'denied'
      ).length,
      deniedCredentialCount: candidates.filter(
        (candidate) =>
          candidate.security.status === 'needs-review' &&
          candidate.decision?.disposition === 'denied'
      ).length,
      operationFindingCount: operationFindings,
      unresolvedOperationRiskCount: candidates.filter(
        (candidate) =>
          candidate.operationRisk.level !== 'none' && candidate.decision?.disposition !== 'denied'
      ).length,
      publicationCount: 0
    },
    provenance: {
      workbook: path.basename(workbook.path),
      workbookSha256: workbook.sha256,
      workbookFormat: 'xlsx',
      workbookRows: workbook.records.length,
      firstDataRow: workbook.records[0].row,
      lastDataRow: workbook.records.at(-1).row,
      sourceDirectory: path.basename(sourceDirectory),
      sourceFileCount: new Set(candidates.map((candidate) => candidate.provenance.sourceFile)).size,
      sourceUrlCount: new Set(candidates.map((candidate) => candidate.provenance.sourceUrl)).size,
      sourceSetSha256: sha256(
        stableJson(
          candidates.map((candidate) => ({
            id: candidate.id,
            sourceFile: candidate.provenance.sourceFile,
            sourceUrl: candidate.provenance.sourceUrl,
            sourceSha256: candidate.provenance.sourceSha256,
            bodySha256: candidate.provenance.bodySha256
          }))
        )
      ),
      artifactManifestPath: RELEASE_MANIFEST_RELATIVE_PATH
    }
  };
  return authority;
}

function writeJson(relativePath, value) {
  const filePath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stableJson(value));
}

function buildArtifacts(authority) {
  const candidatesById = new Map(
    authority.candidates.map((candidate) => [candidate.id, candidate])
  );
  return {
    projection: projectAuthority(authority),
    disposition: {
      schemaVersion: 1,
      batch: authority.batch.id,
      status: 'closed',
      wave: 'wave-0',
      candidateCount: authority.candidates.length,
      accepted: authority.final.accepted,
      denied: authority.final.denied,
      decisions: authority.candidates.map((candidate) => ({
        candidateId: candidate.id,
        identity: candidate.identity,
        state: candidate.state,
        disposition: candidate.decision.disposition,
        operation: candidate.decision.operation,
        reason: candidate.decision.reason,
        evidence: candidate.decision.evidence || [candidate.provenance.sourceUrl]
      }))
    },
    identity: {
      schemaVersion: 1,
      batch: authority.batch.id,
      status: 'closed',
      candidateCount: authority.candidates.length,
      records: authority.candidates.map((candidate) => ({
        candidateId: candidate.id,
        identity: candidate.identity,
        identityKey: `${candidate.identity.locale}|${candidate.identity.canonicalPath}`,
        workbookRow: candidate.provenance.workbookRow,
        resolution:
          candidate.state === 'denied' &&
          candidate.decision.reason === 'existing-identity-collision'
            ? 'existing-identity-collision'
            : candidate.decision.disposition
      })),
      conflicts: authority.identityConflicts
    },
    duplicate: {
      schemaVersion: 1,
      batch: authority.batch.id,
      status: 'closed',
      relationCount: authority.relations.length,
      resolvedRelationCount: authority.relations.filter(
        (relation) => relation.resolution !== 'pending-review'
      ).length,
      relations: authority.relations.map((relation) => ({
        ...relation,
        candidates: relation.relatedCandidateIds.map((candidateId) => ({
          candidateId,
          identity: candidatesById.get(candidateId).identity,
          disposition: candidatesById.get(candidateId).decision.disposition
        }))
      }))
    },
    security: {
      schemaVersion: 1,
      batch: authority.batch.id,
      status: 'closed',
      findingCount: authority.governance.credentialFindingCount,
      unresolvedCount: authority.governance.unresolvedCredentialCount,
      deniedCount: authority.governance.deniedCredentialCount,
      findings: authority.candidates.flatMap((candidate) =>
        candidate.security.findings.map((finding) => ({
          candidateId: candidate.id,
          identity: candidate.identity,
          status: candidate.security.status,
          ...finding
        }))
      )
    },
    operationRisk: {
      schemaVersion: 1,
      batch: authority.batch.id,
      status: 'closed',
      findingCount: authority.governance.operationFindingCount,
      unresolvedCount: authority.governance.unresolvedOperationRiskCount,
      levels: authority.candidates.reduce(
        (levels, candidate) => ({
          ...levels,
          [candidate.operationRisk.level]: levels[candidate.operationRisk.level] + 1
        }),
        { none: 0, D0: 0, D1: 0, D2: 0 }
      ),
      records: authority.candidates
        .filter(
          (candidate) =>
            candidate.operationRisk.level !== 'none' || candidate.operationRisk.findings.length
        )
        .map((candidate) => ({
          candidateId: candidate.id,
          identity: candidate.identity,
          level: candidate.operationRisk.level,
          decision: candidate.operationRisk.decision,
          warning: candidate.operationRisk.warning,
          prerequisite: candidate.operationRisk.prerequisite,
          rollback: candidate.operationRisk.rollback,
          findings: candidate.operationRisk.findings
        }))
    },
    provenance: {
      schemaVersion: 1,
      batch: authority.batch.id,
      status: 'closed',
      workbook: {
        file: authority.provenance.workbook,
        sha256: authority.provenance.workbookSha256,
        format: authority.provenance.workbookFormat,
        rows: authority.provenance.workbookRows,
        firstDataRow: authority.provenance.firstDataRow,
        lastDataRow: authority.provenance.lastDataRow
      },
      sources: authority.candidates.map((candidate) => ({
        candidateId: candidate.id,
        workbookRow: candidate.provenance.workbookRow,
        sourceFile: candidate.provenance.sourceFile,
        sourceUrl: candidate.provenance.sourceUrl,
        sourceSha256: candidate.provenance.sourceSha256,
        bodySha256: candidate.provenance.bodySha256
      })),
      sourceSetSha256: authority.provenance.sourceSetSha256
    }
  };
}

function writeAuthorityArtifacts(authority) {
  const artifacts = buildArtifacts(authority);
  writeJson(PROJECTION_RELATIVE_PATH, artifacts.projection);
  authority.projection.artifactSha256 = sha256(stableJson(artifacts.projection));
  writeJson(AUTHORITY_RELATIVE_PATH, authority);
  writeJson(DISPOSITION_LEDGER_RELATIVE_PATH, artifacts.disposition);
  writeJson(IDENTITY_LEDGER_RELATIVE_PATH, artifacts.identity);
  writeJson(DUPLICATE_LEDGER_RELATIVE_PATH, artifacts.duplicate);
  writeJson(SECURITY_LEDGER_RELATIVE_PATH, artifacts.security);
  writeJson(OPERATION_RISK_LEDGER_RELATIVE_PATH, artifacts.operationRisk);
  writeJson(PROVENANCE_RELATIVE_PATH, artifacts.provenance);
  const artifactPaths = [
    AUTHORITY_RELATIVE_PATH,
    PROJECTION_RELATIVE_PATH,
    DISPOSITION_LEDGER_RELATIVE_PATH,
    IDENTITY_LEDGER_RELATIVE_PATH,
    DUPLICATE_LEDGER_RELATIVE_PATH,
    SECURITY_LEDGER_RELATIVE_PATH,
    OPERATION_RISK_LEDGER_RELATIVE_PATH,
    PROVENANCE_RELATIVE_PATH
  ];
  writeJson(RELEASE_MANIFEST_RELATIVE_PATH, {
    schemaVersion: 1,
    batch: authority.batch.id,
    status: 'closed',
    governanceStatus: authority.governance.status,
    publicationCount: authority.governance.publicationCount,
    sourceSetSha256: authority.provenance.sourceSetSha256,
    artifacts: artifactPaths.map((relativePath) => ({
      path: relativePath,
      sha256: sha256(fs.readFileSync(path.join(ROOT, relativePath)))
    }))
  });
  return artifacts;
}

function main(argv = process.argv.slice(2)) {
  const source = argv[0] || DEFAULT_SOURCE;
  if (!source) {
    throw new Error(
      'Week05 source is required: pass the delivery directory or set FASTGPT_WEEK05_SOURCE'
    );
  }
  const sourceDirectory = path.resolve(source);
  const authority = buildAuthority(sourceDirectory);
  writeAuthorityArtifacts(authority);
  writeJson('scripts/fixtures/technical-authority/week05-tracer.json', {
    schemaVersion: 1,
    candidateId: authority.projection.tracerCandidateId,
    canonicalHost: 'https://fastgpt.cn',
    title: authority.candidates.find(
      (candidate) => candidate.id === authority.projection.tracerCandidateId
    ).title,
    summary: 'Controlled Week05 tracer projection for the Technical Content Authority.',
    operation: 'add'
  });
  console.log(
    `[generate-technical-authority] generated 888 candidates from ${sourceDirectory}; ` +
      `accepted=${authority.counts.accepted} denied=${authority.counts.denied} publication-count=0`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[generate-technical-authority] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildAuthority, buildArtifacts, main, readWorkbook, writeAuthorityArtifacts };
