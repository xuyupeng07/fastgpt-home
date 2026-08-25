#!/usr/bin/env node

/**
 * Normalizes an explicit technical-page delivery source into repository authority and projections.
 * Write mode is intentionally bounded to authority and derived technical-content projections.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const TECHNICAL_CONTENT_POLICY = require('../src/lib/technical-content-policy.json');
const FRONT_MATTER_KEYS = ['title', 'slug', 'page_type', 'source', 'source_type'];
const SOURCE_TYPES = new Map(Object.entries(TECHNICAL_CONTENT_POLICY.sourceTypes));
const CATEGORY_LABELS = TECHNICAL_CONTENT_POLICY.categories;
const EXPECTED_TECHNICAL_PAGE_COUNT = TECHNICAL_CONTENT_POLICY.expectedPageCount;
const EXPECTED_ACCEPTED_COUNT = TECHNICAL_CONTENT_POLICY.expectedAcceptedCount;
const EXPECTED_DENIED_COUNT = TECHNICAL_CONTENT_POLICY.expectedDeniedCount;
const EXPECTED_ADD_COUNT = TECHNICAL_CONTENT_POLICY.expectedAddCount;
const EXPECTED_UPDATE_COUNT = TECHNICAL_CONTENT_POLICY.expectedUpdateCount;
const CORRECTION_FIELDS = new Set([
  'body',
  'canonicalPath',
  'citations',
  'frontMatter',
  'frontMatterSlug',
  'lineEndings',
  'pageType',
  'sourceCount',
  'wordCount'
]);
const SECRET_PATTERN = /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{15,}\b/g;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, '\n');
}

function fold(value) {
  return value.normalize('NFKC').toUpperCase().toLowerCase();
}

function foldIdentity(identity) {
  return `${fold(identity.locale)}|${fold(identity.canonicalPath)}`;
}

function validateIdentitySet(identities) {
  const seen = new Map();
  for (const identity of identities) {
    const key = foldIdentity(identity);
    const previous = seen.get(key);
    if (previous) {
      throw new Error(
        `Technical page identity collision after NFKC case-fold: ${previous.locale}${previous.canonicalPath} and ${identity.locale}${identity.canonicalPath}`
      );
    }
    seen.set(key, identity);
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Schema drift in ${label}: expected an object`);
  }
}

function assertExactKeys(value, expected, label) {
  assertObject(value, label);
  const expectedSet = new Set(expected);
  const actual = Object.keys(value);
  const missing = expected.filter((key) => !actual.includes(key));
  const unexpected = actual.filter((key) => !expectedSet.has(key));
  if (missing.length || unexpected.length) {
    const details = [
      missing.length ? `missing ${missing.join(', ')}` : '',
      unexpected.length ? `unexpected ${unexpected.join(', ')}` : ''
    ]
      .filter(Boolean)
      .join('; ');
    throw new Error(`Schema drift in ${label}: ${details}`);
  }
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Schema drift in ${label}: expected a non-empty string`);
  }
  return value.trim();
}

function requireJsonNonNegativeInteger(value, label) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Schema drift in ${label}: expected a non-negative integer number`);
  }
  return value;
}

function normalizePublicHttpsUrl(value, label) {
  const text = requireText(value, label);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`Schema drift in ${label}: expected an absolute HTTPS URL`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const privateHostname =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home.arpa');
  // IP literals and numeric labels (for example https://2130706433/) can encode
  // private addresses in many notations, so public sources must use domain names.
  const addressLikeHostname = /^[\da-f.:]+$/i.test(hostname);
  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    privateHostname ||
    addressLikeHostname
  ) {
    throw new Error(`Schema drift in ${label}: expected a public HTTPS URL`);
  }
  return url.href;
}

function parseWorkbookNonNegativeInteger(value, label) {
  const text = requireText(value, label);
  if (!/^\d+$/.test(text)) {
    throw new Error(`Schema drift in ${label}: expected a non-negative integer cell`);
  }
  return Number(text);
}

function normalizeCanonicalPath(value, label = 'canonical path') {
  const normalized = requireText(value, label).replace(/\\/g, '/').normalize('NFKC');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  const segments = withLeadingSlash.split('/').slice(1);
  if (
    segments.length < 2 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        /[?#]/.test(segment) ||
        segment.includes('\\')
    )
  ) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  if (withLeadingSlash !== withLeadingSlash.toLowerCase()) {
    throw new Error(`Invalid ${label}: canonical paths must be lowercase`);
  }
  return `/${segments.join('/')}`;
}

function normalizeRelativeFile(value, label = 'source file') {
  const normalized = requireText(value, label).replace(/\\/g, '/').normalize('NFKC');
  if (!normalized.endsWith('.md') || normalized.startsWith('/') || normalized.includes('../')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return segments.join('/');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read JSON source ${filePath}: ${error.message}`);
  }
}

function parseFrontMatter(source, sourcePath) {
  const normalized = normalizeLineEndings(source);
  if (!normalized.startsWith('---\n')) {
    throw new Error(`Schema drift in ${sourcePath}: missing front matter`);
  }
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) {
    throw new Error(`Schema drift in ${sourcePath}: unterminated front matter`);
  }

  const metadata = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator === -1) {
      throw new Error(`Schema drift in ${sourcePath}: invalid front matter line ${line}`);
    }
    const key = line.slice(0, separator).trim();
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      throw new Error(`Schema drift in ${sourcePath}: duplicate front matter key ${key}`);
    }
    metadata[key] = line.slice(separator + 1).trim();
  }
  assertExactKeys(metadata, FRONT_MATTER_KEYS, `${sourcePath} front matter`);
  return {
    metadata,
    body: normalized
      .slice(end + 4)
      .replace(/^\n/, '')
      .trim()
  };
}

function inferSourceType(source) {
  return source.includes('github.com/') ? 'GitHub issue' : '官方文档小节';
}

function readSourceDocument(source, record) {
  const normalized = normalizeLineEndings(source);
  if (normalized.startsWith('---\n')) {
    return { ...parseFrontMatter(normalized, record.file), generatedFrontMatter: false };
  }
  if (!normalized.trimStart().startsWith('#')) {
    throw new Error(`Schema drift in ${record.file}: missing front matter and Markdown heading`);
  }
  return {
    metadata: {
      title: record.title,
      slug: `/zh/${normalizeCanonicalPath(record.slug).slice(1)}`,
      page_type: record.pageType,
      source: record.source,
      source_type: inferSourceType(record.source)
    },
    body: normalized.trim(),
    generatedFrontMatter: true
  };
}

function sanitizeBody(body) {
  let replacements = 0;
  const normalized = body.replace(SECRET_PATTERN, () => {
    replacements += 1;
    return 'YOUR_API_KEY';
  });
  return { body: normalized, replacements };
}

function normalizeCitations(body) {
  let replacements = 0;
  const labelForUrl = (url) =>
    url.includes('github.com/') ? 'FastGPT GitHub issue' : 'FastGPT 官方文档';
  let normalized = body.replace(
    /^([ \t]*>[ \t]*来源：[ \t]*)(https:\/\/[^\s)]+)[ \t]*$/gmu,
    (_, prefix, url) => {
      replacements += 1;
      return `${prefix}[${labelForUrl(url)}](${url})`;
    }
  );
  normalized = normalized.replace(
    /^([ \t]*)`(> 来源：[ \t]*)(https:\/\/[^\s)`]+)`[ \t]*$/gmu,
    (_, indentation, prefix, url) => {
      replacements += 1;
      return `${indentation}${prefix}[${labelForUrl(url)}](${url})`;
    }
  );
  normalized = normalized.replace(
    /(\\n)([ \t]*> 来源：[ \t]*)(https:\/\/[^\s)\\]+)(?=\\n|$)/g,
    (_, separator, prefix, url) => {
      replacements += 1;
      return `${separator}${prefix}[${labelForUrl(url)}](${url})`;
    }
  );
  return { body: normalized, replacements };
}

function extractCitationUrls(body, label) {
  const urls = [];
  const pattern =
    /^\s*>\s*(?:来源|Source|Sources|参考资料|References)\s*[:：]\s*(?:\[[^\]]+\]\(([^)\s]+)\)|([^\s]+))\s*$/gimu;
  for (const match of body.matchAll(pattern)) {
    const url = match[1] || match[2];
    normalizePublicHttpsUrl(url, `${label} citation`);
    urls.push(url);
  }
  return [...new Set(urls)];
}

function validateBodyIntegrity(body, record, label) {
  if (!body.trim() || record.wordCount < 1) {
    throw new Error(`Schema drift in ${label}: wordCount must be positive for a publishable page`);
  }
  const citationUrls = extractCitationUrls(body, label);
  if (citationUrls.length !== record.sourceCount) {
    throw new Error(
      `Schema drift in ${label}: sourceCount ${record.sourceCount} does not match ${citationUrls.length} unique citation URL(s)`
    );
  }
}

function normalizeStructuralEscapedLineEndings(body) {
  let replacements = 0;
  let normalized = body.replace(
    /\\n\\n(?=#{1,6}[ \t]|>[ \t])|\\n(?=#{1,6}[ \t]|>[ \t])/g,
    (match) => {
      replacements += 1;
      return match === '\\n\\n' ? '\n\n' : '\n';
    }
  );
  normalized = normalized.replace(/(^|\n)([ \t]{0,3}#{1,6}[ \t].*?)\\n/g, (_, prefix, heading) => {
    replacements += 1;
    return `${prefix}${heading}\n`;
  });
  return { body: normalized, replacements };
}

function normalizeDocument(metadata, locale, canonicalPath, body) {
  const normalizedBody = body.trim();
  const normalizedMetadata = {
    ...metadata,
    slug: `/${locale}${canonicalPath}`
  };
  const header = FRONT_MATTER_KEYS.map((key) => `${key}: ${normalizedMetadata[key]}`).join('\n');
  return {
    body: normalizedBody,
    document: `---\n${header}\n---\n\n${normalizedBody}\n`
  };
}

function deriveSummary(title, body) {
  const summary = body
    .replace(/^```[\s\S]*?```$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!summary) return title;
  if (summary.length <= 155) return summary;
  return `${summary.slice(0, 154).trim()}…`;
}

function buildNormalizedTechnicalPage({ metadata, identity, body, wordCount, sourceCount, label }) {
  normalizePublicHttpsUrl(metadata.source, `${label} source`);
  const sanitized = sanitizeBody(body);
  const citations = normalizeCitations(sanitized.body);
  const lineEndings = normalizeStructuralEscapedLineEndings(citations.body);
  validateBodyIntegrity(lineEndings.body, { wordCount, sourceCount }, label);
  const normalized = normalizeDocument(
    metadata,
    identity.locale,
    identity.canonicalPath,
    lineEndings.body
  );
  const category = identity.canonicalPath.split('/')[1];
  const categoryLabel = CATEGORY_LABELS[category];
  if (!categoryLabel) {
    throw new Error(`Schema drift in ${label}: unsupported category ${category}`);
  }
  return {
    body: normalized.body,
    document: normalized.document,
    projection: {
      title: metadata.title,
      slug: `/${identity.locale}${identity.canonicalPath}`,
      category,
      categoryLabel,
      ...(metadata.source ? { source: metadata.source } : {}),
      sourceType: normalizeSourceType(metadata.source_type, `${label} source_type`),
      summary: deriveSummary(metadata.title, normalized.body),
      minutes: Math.max(1, Math.ceil(normalized.body.length / 500))
    },
    replacements: {
      body: sanitized.replacements,
      citations: citations.replacements,
      lineEndings: lineEndings.replacements
    }
  };
}

function normalizeSourceType(value, label) {
  const normalized = SOURCE_TYPES.get(requireText(value, label));
  if (!normalized) throw new Error(`Schema drift in ${label}: unsupported source type ${value}`);
  return normalized;
}

function isSupportedSourceType(value) {
  return [...SOURCE_TYPES.values()].includes(value);
}

function parseJsonDelivery(filePath) {
  const source = readJson(filePath);
  assertExactKeys(source, ['schemaVersion', 'accepted', 'denied'], filePath);
  if (source.schemaVersion !== 1) {
    throw new Error(
      `Schema drift in ${filePath}: unsupported schemaVersion ${source.schemaVersion}`
    );
  }
  if (!Array.isArray(source.accepted) || !Array.isArray(source.denied)) {
    throw new Error(`Schema drift in ${filePath}: accepted and denied must be arrays`);
  }

  const accepted = source.accepted.map((record, index) => {
    const label = `${filePath} accepted[${index}]`;
    assertExactKeys(
      record,
      ['file', 'prefix', 'slug', 'title', 'pageType', 'wordCount', 'sourceCount', 'source'],
      label
    );
    return {
      file: normalizeRelativeFile(record.file, `${label}.file`),
      prefix: requireText(record.prefix, `${label}.prefix`),
      slug: requireText(record.slug, `${label}.slug`),
      title: requireText(record.title, `${label}.title`),
      pageType: requireText(record.pageType, `${label}.pageType`),
      wordCount: requireJsonNonNegativeInteger(record.wordCount, `${label}.wordCount`),
      sourceCount: requireJsonNonNegativeInteger(record.sourceCount, `${label}.sourceCount`),
      source: normalizePublicHttpsUrl(record.source, `${label}.source`),
      row: index + 2
    };
  });
  const denied = source.denied.map((record, index) => {
    const label = `${filePath} denied[${index}]`;
    assertExactKeys(record, ['slug', 'title', 'reason'], label);
    return {
      slug: requireText(record.slug, `${label}.slug`),
      title: requireText(record.title, `${label}.title`),
      reason: requireText(record.reason, `${label}.reason`),
      row: index + 2
    };
  });
  return { accepted, denied };
}

function xmlDecode(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function xmlAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`${name}="([^"]*)"`));
  return match ? xmlDecode(match[1]) : undefined;
}

function zipEntry(buffer, requestedName) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd === -1) throw new Error('Invalid XLSX source: ZIP end record is missing');
  const entries = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  let offset = directoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid XLSX source: central directory is malformed');
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (name !== requestedName) continue;

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(start, start + compressedSize);
    if (method === 0) return compressed;
    if (method === 8) return zlib.inflateRawSync(compressed);
    throw new Error(`Unsupported XLSX compression method ${method}`);
  }
  throw new Error(`Invalid XLSX source: missing ${requestedName}`);
}

function parseXmlRows(xml, sharedStrings = []) {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(([, rowBody]) => {
    const values = {};
    for (const match of rowBody.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = match[1];
      const contents = match[2] || '';
      const cell = xmlAttribute(attributes, 'r');
      if (!cell) continue;
      const column = cell.replace(/\d+$/, '');
      const type = xmlAttribute(attributes, 't');
      let value =
        contents
          .match(/<t[^>]*>([\s\S]*?)<\/t>/g)
          ?.map((part) => part.replace(/^<t[^>]*>|<\/t>$/g, '').trim())
          .join('') ||
        contents.match(/<v>([\s\S]*?)<\/v>/)?.[1] ||
        '';
      value = xmlDecode(value);
      if (type === 's') value = sharedStrings[Number(value)] || '';
      values[column] = value;
    }
    return values;
  });
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, item]) =>
    xmlDecode(
      item
        .match(/<t[^>]*>([\s\S]*?)<\/t>/g)
        ?.map((part) => part.replace(/^<t[^>]*>|<\/t>$/g, '').trim())
        .join('') || ''
    )
  );
}

function readWorkbookSheets(buffer) {
  const workbook = zipEntry(buffer, 'xl/workbook.xml').toString('utf8');
  const relationships = zipEntry(buffer, 'xl/_rels/workbook.xml.rels').toString('utf8');
  const relationMap = new Map(
    [...relationships.matchAll(/<Relationship\b([^>]*)\/>/g)].map(([, attributes]) => [
      xmlAttribute(attributes, 'Id'),
      xmlAttribute(attributes, 'Target')
    ])
  );
  const sheets = new Map();
  for (const [, attributes] of workbook.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = xmlAttribute(attributes, 'name');
    const relation = relationMap.get(xmlAttribute(attributes, 'r:id'));
    if (!name || !relation)
      throw new Error('Schema drift in XLSX workbook: invalid sheet relation');
    const target = relation.replace(/^\//, '').startsWith('xl/')
      ? relation.replace(/^\//, '')
      : path.posix.join('xl', relation.replace(/^\//, ''));
    sheets.set(name, target);
  }
  return sheets;
}

function parseWorkbook(filePath) {
  const buffer = fs.readFileSync(filePath);
  const sheets = readWorkbookSheets(buffer);
  const acceptedSheet = sheets.get('上线清单');
  const deniedSheet = sheets.get('已合并不上线');
  if (!acceptedSheet || !deniedSheet || !sheets.has('说明与纪律')) {
    throw new Error(
      'Schema drift in XLSX workbook: expected 上线清单, 已合并不上线, and 说明与纪律 sheets'
    );
  }
  const sharedStrings = (() => {
    try {
      return parseSharedStrings(zipEntry(buffer, 'xl/sharedStrings.xml').toString('utf8'));
    } catch {
      return [];
    }
  })();
  const acceptedRows = parseXmlRows(
    zipEntry(buffer, acceptedSheet).toString('utf8'),
    sharedStrings
  );
  const deniedRows = parseXmlRows(zipEntry(buffer, deniedSheet).toString('utf8'), sharedStrings);
  const acceptedHeaders = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const deniedHeaders = ['A', 'B', 'C'];
  const expectedAccepted = [
    '前缀',
    'slug（上线 URL 路径）',
    '标题',
    '页型',
    '字数',
    '来源标注数',
    '来源'
  ];
  const expectedDenied = ['slug', '标题', '说明'];
  if (
    acceptedHeaders.some((column, index) => acceptedRows[0]?.[column] !== expectedAccepted[index])
  ) {
    throw new Error('Schema drift in XLSX 上线清单: header columns changed');
  }
  if (deniedHeaders.some((column, index) => deniedRows[0]?.[column] !== expectedDenied[index])) {
    throw new Error('Schema drift in XLSX 已合并不上线: header columns changed');
  }

  const accepted = acceptedRows.slice(1).map((row, index) => ({
    prefix: requireText(row.A, `XLSX 上线清单 row ${index + 2} prefix`),
    slug: requireText(row.B, `XLSX 上线清单 row ${index + 2} slug`),
    title: requireText(row.C, `XLSX 上线清单 row ${index + 2} title`),
    pageType: requireText(row.D, `XLSX 上线清单 row ${index + 2} page type`),
    wordCount: parseWorkbookNonNegativeInteger(row.E, `XLSX 上线清单 row ${index + 2} word count`),
    sourceCount: parseWorkbookNonNegativeInteger(
      row.F,
      `XLSX 上线清单 row ${index + 2} source count`
    ),
    source: normalizePublicHttpsUrl(row.G, `XLSX 上线清单 row ${index + 2} source`),
    row: index + 2
  }));
  const denied = deniedRows.slice(1).map((row, index) => ({
    slug: requireText(row.A, `XLSX 已合并不上线 row ${index + 2} slug`),
    title: requireText(row.B, `XLSX 已合并不上线 row ${index + 2} title`),
    reason: requireText(row.C, `XLSX 已合并不上线 row ${index + 2} reason`),
    row: index + 2
  }));
  return { accepted, denied };
}

function listMarkdownFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('附-')) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath);
    }
  }
  visit(root);
  return files;
}

function readDeliverySource(sourcePath) {
  const resolvedSource = path.resolve(sourcePath);
  if (!fs.existsSync(resolvedSource))
    throw new Error(`Delivery source does not exist: ${sourcePath}`);
  const stat = fs.statSync(resolvedSource);
  const sourceRoot = stat.isDirectory() ? resolvedSource : path.dirname(resolvedSource);
  let sourceFile = resolvedSource;
  let parsed;
  if (stat.isDirectory()) {
    const jsonPath = path.join(resolvedSource, 'delivery.json');
    const workbooks = fs
      .readdirSync(resolvedSource)
      .filter((name) => name.toLowerCase().endsWith('.xlsx'))
      .map((name) => path.join(resolvedSource, name));
    if (fs.existsSync(jsonPath)) {
      sourceFile = jsonPath;
      parsed = parseJsonDelivery(jsonPath);
    } else if (workbooks.length === 1) {
      sourceFile = workbooks[0];
      parsed = parseWorkbook(sourceFile);
    } else {
      throw new Error('Delivery source must contain delivery.json or exactly one XLSX workbook');
    }
  } else if (resolvedSource.toLowerCase().endsWith('.json')) {
    parsed = parseJsonDelivery(resolvedSource);
  } else if (resolvedSource.toLowerCase().endsWith('.xlsx')) {
    parsed = parseWorkbook(resolvedSource);
  } else {
    throw new Error('Delivery source must be a directory, delivery.json, or XLSX workbook');
  }
  return {
    root: sourceRoot,
    file: path.basename(sourceFile),
    format: sourceFile.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'json',
    hash: sha256(fs.readFileSync(sourceFile)),
    markdownFiles: listMarkdownFiles(sourceRoot),
    ...parsed
  };
}

function validateDeliveryRecords(delivery) {
  const seenFiles = new Set();
  for (const [index, record] of delivery.accepted.entries()) {
    const label = `accepted[${index}]`;
    if (!Number.isInteger(record.wordCount) || record.wordCount < 0) {
      throw new Error(`Schema drift in ${label}: wordCount must be a non-negative integer`);
    }
    if (!Number.isInteger(record.sourceCount) || record.sourceCount < 0) {
      throw new Error(`Schema drift in ${label}: sourceCount must be a non-negative integer`);
    }
    normalizeCanonicalPath(record.slug, `${label}.slug`);
    const file = normalizeRelativeFile(
      record.file || `${record.prefix}/${path.posix.basename(record.slug)}.md`
    );
    if (seenFiles.has(file))
      throw new Error(`Schema drift in delivery source: duplicate source file ${file}`);
    seenFiles.add(file);
    record.file = file;
  }
  for (const [index, record] of delivery.denied.entries()) {
    normalizeCanonicalPath(record.slug, `denied[${index}].slug`);
  }
}

function readExistingEntries(repoRoot) {
  const entryPath = path.join(repoRoot, 'src/components/tech-center/entries.json');
  return fs.existsSync(entryPath) ? JSON.parse(fs.readFileSync(entryPath, 'utf8')) : [];
}

function readPriorManifest(repoRoot) {
  const manifestPath = path.join(
    repoRoot,
    'src/content/tech-center/authority/import-manifest.json'
  );
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function parseIdentityFromSlug(slug, label) {
  const match = requireText(slug, label).match(/^\/([^/]+)(\/.*)$/);
  if (!match) throw new Error(`Invalid technical page slug in ${label}: ${slug}`);
  return { locale: fold(match[1]), canonicalPath: normalizeCanonicalPath(match[2], label) };
}

function buildImportPlan({ repoRoot = REPOSITORY_ROOT, sourcePath }) {
  if (!sourcePath) throw new Error('An explicit --source argument is required');
  const delivery = readDeliverySource(sourcePath);
  validateDeliveryRecords(delivery);
  const markdownByPath = new Map(
    delivery.markdownFiles.map((filePath) => [
      path.relative(delivery.root, filePath).replace(/\\/g, '/'),
      filePath
    ])
  );
  const existingEntries = readExistingEntries(repoRoot);
  const existingIdentities = existingEntries.map((entry) =>
    parseIdentityFromSlug(entry.slug, 'repository registry')
  );
  const sourceIdentities = [];
  const priorManifest = readPriorManifest(repoRoot);
  const priorPages = new Map(
    (priorManifest?.pages || []).map((page) => [foldIdentity(page.identity), page])
  );
  const existingByIdentity = new Map(
    existingEntries.map((entry, index) => [foldIdentity(existingIdentities[index]), entry])
  );
  const pages = delivery.accepted.map((record, index) => {
    const sourceFile = markdownByPath.get(record.file);
    if (!sourceFile) throw new Error(`Delivery source is missing Markdown file ${record.file}`);
    const rawSource = fs.readFileSync(sourceFile, 'utf8');
    const parsed = readSourceDocument(rawSource, record);
    const metadata = parsed.metadata;
    if (metadata.title !== record.title)
      throw new Error(`Schema drift in ${record.file}: title differs from delivery row`);
    if (metadata.source !== record.source)
      throw new Error(`Schema drift in ${record.file}: source differs from delivery row`);
    const routeIdentity = parseIdentityFromSlug(metadata.slug, `${record.file} front matter slug`);
    const canonicalPath = normalizeCanonicalPath(
      `/${record.file.slice(0, -3)}`,
      `${record.file} canonical path`
    );
    const identity = { locale: routeIdentity.locale, canonicalPath };
    sourceIdentities.push(identity);
    const normalized = buildNormalizedTechnicalPage({
      metadata,
      identity,
      body: parsed.body,
      wordCount: record.wordCount,
      sourceCount: record.sourceCount,
      label: record.file
    });
    const normalizedBodySha256 = sha256(normalized.body);
    const sourceHash = sha256(Buffer.from(rawSource));
    const projection = normalized.projection;
    const key = foldIdentity(identity);
    const prior = priorPages.get(key);
    const existing = existingByIdentity.get(key);
    const unchanged =
      prior?.sourceHash === sourceHash && prior?.normalizedBody?.sha256 === normalizedBodySha256;
    const wasBaselineIdentity = existing && (!prior || prior.operation === 'update');
    const operation = unchanged ? prior.operation : wasBaselineIdentity ? 'update' : 'add';
    const rawPath = normalizeCanonicalPath(record.slug, `${record.file} delivery slug`);
    const corrections = [];
    if (parsed.generatedFrontMatter) {
      corrections.push({
        identity,
        field: 'frontMatter',
        from: 'missing',
        to: 'generated from delivery row',
        reason:
          'Add the required normalized front matter before the page enters the repository projection.'
      });
    }
    if (rawPath !== identity.canonicalPath) {
      corrections.push({
        identity,
        field: 'canonicalPath',
        from: rawPath,
        to: identity.canonicalPath,
        reason:
          'Use the owner-relative source file path as the canonical path when the delivery slug prefix disagrees.'
      });
    }
    if (routeIdentity.canonicalPath !== identity.canonicalPath) {
      corrections.push({
        identity,
        field: 'frontMatterSlug',
        from: metadata.slug,
        to: projection.slug,
        reason: 'Align the published slug with the normalized owner-relative canonical path.'
      });
    }
    if (metadata.page_type !== record.pageType) {
      corrections.push({
        identity,
        field: 'pageType',
        from: record.pageType,
        to: metadata.page_type,
        reason:
          'Use the page type declared by the normalized Markdown front matter and retain the delivery value as provenance.'
      });
    }
    if (normalized.replacements.body) {
      corrections.push({
        identity,
        field: 'body',
        from: 'synthetic secret-shaped value',
        to: 'YOUR_API_KEY',
        reason: `Replace ${normalized.replacements.body} synthetic secret-shaped example value(s) before publication.`
      });
    }
    if (normalized.replacements.citations) {
      corrections.push({
        identity,
        field: 'citations',
        from: 'bare HTTPS citation URL(s)',
        to: 'descriptive Markdown link(s)',
        reason: `Normalize ${normalized.replacements.citations} source citation URL(s) into reader-facing Markdown links.`
      });
    }
    if (normalized.replacements.lineEndings) {
      corrections.push({
        identity,
        field: 'lineEndings',
        from: 'escaped structural Markdown line ending(s)',
        to: 'literal Markdown line ending(s)',
        reason: `Decode ${normalized.replacements.lineEndings} structural Markdown line ending escape(s) before publication.`
      });
    }
    return {
      identity,
      operation,
      source: {
        file: record.file,
        row: record.row || index + 2,
        rawSlug: record.slug,
        sourceUrl: metadata.source,
        sourceHash,
        wordCount: record.wordCount,
        sourceCount: record.sourceCount
      },
      normalizedDocument: normalized.document,
      normalizedBodySha256,
      normalizedBodyPath: `src/content/tech-center${identity.canonicalPath}.md`,
      projection,
      corrections
    };
  });

  validateIdentitySet(existingIdentities);
  validateIdentitySet(sourceIdentities);
  const existingByFold = new Map(
    existingIdentities.map((identity) => [foldIdentity(identity), identity])
  );
  for (const identity of sourceIdentities) {
    const existing = existingByFold.get(foldIdentity(identity));
    if (
      existing &&
      (existing.locale !== identity.locale || existing.canonicalPath !== identity.canonicalPath)
    ) {
      throw new Error(
        `Technical page identity collision after NFKC case-fold: ${existing.locale}${existing.canonicalPath} and ${identity.locale}${identity.canonicalPath}`
      );
    }
  }
  const sourceKeys = new Set(sourceIdentities.map(foldIdentity));
  const denials = delivery.denied.map((record) => {
    const identity = { locale: 'zh', canonicalPath: normalizeCanonicalPath(record.slug) };
    if (sourceKeys.has(foldIdentity(identity))) {
      throw new Error(
        `Schema drift in delivery source: identity is both accepted and denied ${record.slug}`
      );
    }
    return {
      identity,
      rawSlug: record.slug,
      title: record.title,
      reason: record.reason,
      row: record.row
    };
  });
  const corrections = pages
    .flatMap((page) => page.corrections)
    .sort((first, second) =>
      `${foldIdentity(first.identity)}|${first.field}`.localeCompare(
        `${foldIdentity(second.identity)}|${second.field}`
      )
    );
  const ledger = {
    schemaVersion: 1,
    corrections,
    denials: denials.sort((first, second) =>
      foldIdentity(first.identity).localeCompare(foldIdentity(second.identity))
    ),
    approvedExceptions: []
  };
  const manifestPages = pages
    .map((page) => ({
      identity: page.identity,
      operation: page.operation,
      provenance: {
        deliveryFile: delivery.file,
        deliveryRow: page.source.row,
        sourceFile: page.source.file,
        rawSlug: page.source.rawSlug,
        sourceUrl: page.source.sourceUrl,
        wordCount: page.source.wordCount,
        sourceCount: page.source.sourceCount
      },
      sourceHash: page.source.sourceHash,
      normalizedBody: {
        path: page.normalizedBodyPath,
        sha256: page.normalizedBodySha256
      },
      projection: page.projection
    }))
    .sort((first, second) =>
      foldIdentity(first.identity).localeCompare(foldIdentity(second.identity))
    );
  return {
    source: {
      file: delivery.file,
      format: delivery.format,
      sha256: delivery.hash,
      acceptedCount: delivery.accepted.length,
      deniedCount: delivery.denied.length
    },
    pages: pages.sort((first, second) =>
      foldIdentity(first.identity).localeCompare(foldIdentity(second.identity))
    ),
    manifest: {
      schemaVersion: 1,
      source: {
        file: delivery.file,
        format: delivery.format,
        sha256: delivery.hash,
        acceptedCount: delivery.accepted.length,
        deniedCount: delivery.denied.length
      },
      pages: manifestPages
    },
    ledger,
    existingEntries
  };
}

function validateImportPlanPolicy(plan) {
  if (plan.pages.length !== EXPECTED_ACCEPTED_COUNT) {
    throw new Error(
      `Technical content import accepted count drift: expected ${EXPECTED_ACCEPTED_COUNT}, found ${plan.pages.length}`
    );
  }
  if (plan.ledger.denials.length !== EXPECTED_DENIED_COUNT) {
    throw new Error(
      `Technical content import denied count drift: expected ${EXPECTED_DENIED_COUNT}, found ${plan.ledger.denials.length}`
    );
  }
  assertExpectedOperationCounts(plan.pages, 'Technical content import operation');
}

function countImportOperations(pages) {
  return pages.reduce(
    (counts, page) => ({ ...counts, [page.operation]: counts[page.operation] + 1 }),
    { add: 0, update: 0 }
  );
}

function assertExpectedOperationCounts(pages, label) {
  const operationCounts = countImportOperations(pages);
  if (
    operationCounts.add !== EXPECTED_ADD_COUNT ||
    operationCounts.update !== EXPECTED_UPDATE_COUNT
  ) {
    throw new Error(
      `${label} drift: expected add=${EXPECTED_ADD_COUNT}, update=${EXPECTED_UPDATE_COUNT}; found add=${operationCounts.add}, update=${operationCounts.update}`
    );
  }
}

function mergeProjectionEntries(existingEntries, pages) {
  const entries = existingEntries.map((entry) => ({ ...entry }));
  const indexes = new Map(
    entries.map((entry, index) => [
      foldIdentity(parseIdentityFromSlug(entry.slug, 'technical content registry')),
      index
    ])
  );
  for (const page of pages) {
    const identity = parseIdentityFromSlug(page.projection.slug, 'technical content projection');
    const identityKey = foldIdentity(identity);
    const existingIndex = indexes.get(identityKey);
    if (existingIndex === undefined) {
      indexes.set(identityKey, entries.length);
      entries.push(page.projection);
    } else {
      entries[existingIndex] = page.projection;
    }
  }
  return entries;
}

function buildSearchProjection(entries) {
  const identities = entries.map((entry) =>
    parseIdentityFromSlug(entry.slug, 'technical content registry')
  );
  validateIdentitySet(identities);
  return entries.map((entry, index) => {
    const identity = identities[index];
    return {
      identity: foldIdentity(identity),
      title: entry.title,
      description: entry.summary,
      category: entry.category,
      locale: identity.locale,
      publicPath: identity.canonicalPath,
      sourceType: entry.sourceType,
      minutes: entry.minutes
    };
  });
}

function assertDeniedIdentitiesAbsent(denials, entries, searchProjection) {
  const deniedIdentities = new Set(denials.map((denial) => foldIdentity(denial.identity)));
  const assertAbsent = (identity, surface) => {
    if (deniedIdentities.has(foldIdentity(identity))) {
      throw new Error(
        `Denied technical content identity is present in ${surface}: ${identity.locale}${identity.canonicalPath}`
      );
    }
  };
  entries.forEach((entry) =>
    assertAbsent(parseIdentityFromSlug(entry.slug, 'technical content registry'), 'registry')
  );
  searchProjection.forEach((entry) =>
    assertAbsent({ locale: entry.locale, canonicalPath: entry.publicPath }, 'search projection')
  );
}

function writeFileAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, content);
  fs.renameSync(temporaryPath, filePath);
}

function writeImportPlan(plan, repoRoot = REPOSITORY_ROOT) {
  const entryPath = path.join(repoRoot, 'src/components/tech-center/entries.json');
  const searchPath = path.join(repoRoot, 'public/tech-center/search-index.json');
  const authorityRoot = path.join(repoRoot, 'src/content/tech-center/authority');
  const manifestPath = path.join(authorityRoot, 'import-manifest.json');
  const ledgerPath = path.join(authorityRoot, 'decision-ledger.json');
  const entries = mergeProjectionEntries(plan.existingEntries, plan.pages);
  entries.forEach((entry, index) =>
    validateAuthorityProjection(entry, `technical content registry[${index}]`)
  );
  const searchProjection = buildSearchProjection(entries);
  assertDeniedIdentitiesAbsent(plan.ledger.denials, entries, searchProjection);
  writeFileAtomic(entryPath, stableJson(entries));
  writeFileAtomic(searchPath, stableJson(searchProjection));
  for (const page of plan.pages) {
    writeFileAtomic(path.join(repoRoot, page.normalizedBodyPath), page.normalizedDocument);
  }
  writeFileAtomic(manifestPath, stableJson(plan.manifest));
  writeFileAtomic(ledgerPath, stableJson(plan.ledger));
}

function assertFileContent(filePath, expected, label) {
  if (!fs.existsSync(filePath)) throw new Error(`Technical content drift: missing ${label}`);
  const actual = fs.readFileSync(filePath, 'utf8');
  if (actual !== expected) throw new Error(`Technical content drift: ${label}`);
}

function verifyImportPlanNoDrift(plan, repoRoot = REPOSITORY_ROOT) {
  const entries = mergeProjectionEntries(plan.existingEntries, plan.pages);
  entries.forEach((entry, index) =>
    validateAuthorityProjection(entry, `technical content registry[${index}]`)
  );
  const searchProjection = buildSearchProjection(entries);
  assertDeniedIdentitiesAbsent(plan.ledger.denials, entries, searchProjection);
  assertFileContent(
    path.join(repoRoot, 'src/components/tech-center/entries.json'),
    stableJson(entries),
    'registry projection'
  );
  assertFileContent(
    path.join(repoRoot, 'public/tech-center/search-index.json'),
    stableJson(searchProjection),
    'search projection'
  );
  assertFileContent(
    path.join(repoRoot, 'src/content/tech-center/authority/import-manifest.json'),
    stableJson(plan.manifest),
    'import manifest'
  );
  assertFileContent(
    path.join(repoRoot, 'src/content/tech-center/authority/decision-ledger.json'),
    stableJson(plan.ledger),
    'decision ledger'
  );
  for (const page of plan.pages) {
    assertFileContent(
      path.join(repoRoot, page.normalizedBodyPath),
      page.normalizedDocument,
      `body projection ${page.identity.locale}${page.identity.canonicalPath}`
    );
  }
}

function assertHash(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Schema drift in ${label}: expected a SHA-256 hex digest`);
  }
}

function validateAuthorityIdentity(identity, label) {
  assertExactKeys(identity, ['locale', 'canonicalPath'], label);
  const locale = requireText(identity.locale, `${label}.locale`);
  const canonicalPath = normalizeCanonicalPath(identity.canonicalPath, `${label}.canonicalPath`);
  if (locale !== fold(locale) || canonicalPath !== identity.canonicalPath) {
    throw new Error(`Schema drift in ${label}: identity must be normalized`);
  }
}

function validateAuthorityProjection(projection, label) {
  const expectedKeys = [
    'title',
    'slug',
    'category',
    'categoryLabel',
    'sourceType',
    'summary',
    'minutes'
  ];
  if (Object.prototype.hasOwnProperty.call(projection, 'source')) expectedKeys.push('source');
  assertExactKeys(projection, expectedKeys, label);
  requireText(projection.title, `${label}.title`);
  requireText(projection.slug, `${label}.slug`);
  requireText(projection.category, `${label}.category`);
  requireText(projection.categoryLabel, `${label}.categoryLabel`);
  requireText(projection.sourceType, `${label}.sourceType`);
  if (!isSupportedSourceType(projection.sourceType)) {
    throw new Error(
      `Schema drift in ${label}.sourceType: unsupported source type ${projection.sourceType}`
    );
  }
  requireText(projection.summary, `${label}.summary`);
  requireJsonNonNegativeInteger(projection.minutes, `${label}.minutes`);
  if (projection.minutes < 1)
    throw new Error(`Schema drift in ${label}.minutes: expected at least 1`);
  if (projection.source !== undefined) {
    normalizePublicHttpsUrl(projection.source, `${label}.source`);
  }
}

function validateSearchProjectionEntry(entry, label) {
  assertExactKeys(
    entry,
    [
      'identity',
      'title',
      'description',
      'category',
      'locale',
      'publicPath',
      'sourceType',
      'minutes'
    ],
    label
  );
  requireText(entry.identity, `${label}.identity`);
  requireText(entry.title, `${label}.title`);
  requireText(entry.description, `${label}.description`);
  requireText(entry.category, `${label}.category`);
  if (!Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, entry.category)) {
    throw new Error(`Schema drift in ${label}.category: unknown category ${entry.category}`);
  }
  const locale = requireText(entry.locale, `${label}.locale`);
  const publicPath = normalizeCanonicalPath(entry.publicPath, `${label}.publicPath`);
  requireText(entry.sourceType, `${label}.sourceType`);
  if (!isSupportedSourceType(entry.sourceType)) {
    throw new Error(
      `Schema drift in ${label}.sourceType: unsupported source type ${entry.sourceType}`
    );
  }
  requireJsonNonNegativeInteger(entry.minutes, `${label}.minutes`);
  if (entry.minutes < 1) throw new Error(`Schema drift in ${label}.minutes: expected at least 1`);
  if (locale !== fold(locale) || publicPath !== entry.publicPath) {
    throw new Error(`Schema drift in ${label}: public identity fields must be normalized`);
  }
  if (entry.identity !== `${locale}|${publicPath}`) {
    throw new Error(`Schema drift in ${label}.identity: identity does not match locale and path`);
  }
}

function validateManifestPage(page, index) {
  const label = `committed import manifest pages[${index}]`;
  assertExactKeys(
    page,
    ['identity', 'operation', 'provenance', 'sourceHash', 'normalizedBody', 'projection'],
    label
  );
  validateAuthorityIdentity(page.identity, `${label}.identity`);
  if (page.operation !== 'add' && page.operation !== 'update') {
    throw new Error(`Schema drift in ${label}.operation: unsupported operation ${page.operation}`);
  }
  assertExactKeys(
    page.provenance,
    [
      'deliveryFile',
      'deliveryRow',
      'sourceFile',
      'rawSlug',
      'sourceUrl',
      'wordCount',
      'sourceCount'
    ],
    `${label}.provenance`
  );
  requireText(page.provenance.deliveryFile, `${label}.provenance.deliveryFile`);
  requireJsonNonNegativeInteger(page.provenance.deliveryRow, `${label}.provenance.deliveryRow`);
  requireText(page.provenance.sourceFile, `${label}.provenance.sourceFile`);
  requireText(page.provenance.rawSlug, `${label}.provenance.rawSlug`);
  requireText(page.provenance.sourceUrl, `${label}.provenance.sourceUrl`);
  requireJsonNonNegativeInteger(page.provenance.wordCount, `${label}.provenance.wordCount`);
  requireJsonNonNegativeInteger(page.provenance.sourceCount, `${label}.provenance.sourceCount`);
  assertHash(page.sourceHash, `${label}.sourceHash`);
  assertExactKeys(page.normalizedBody, ['path', 'sha256'], `${label}.normalizedBody`);
  normalizeRelativeFile(page.normalizedBody.path, `${label}.normalizedBody.path`);
  assertHash(page.normalizedBody.sha256, `${label}.normalizedBody.sha256`);
  validateAuthorityProjection(page.projection, `${label}.projection`);
}

function validateLedgerCorrection(correction, index) {
  const label = `committed decision ledger corrections[${index}]`;
  assertExactKeys(correction, ['identity', 'field', 'from', 'to', 'reason'], label);
  validateAuthorityIdentity(correction.identity, `${label}.identity`);
  requireText(correction.field, `${label}.field`);
  requireText(correction.from, `${label}.from`);
  requireText(correction.to, `${label}.to`);
  requireText(correction.reason, `${label}.reason`);
}

function validateLedgerDenial(denial, index) {
  const label = `committed decision ledger denials[${index}]`;
  assertExactKeys(denial, ['identity', 'rawSlug', 'title', 'reason', 'row'], label);
  validateAuthorityIdentity(denial.identity, `${label}.identity`);
  requireText(denial.rawSlug, `${label}.rawSlug`);
  requireText(denial.title, `${label}.title`);
  requireText(denial.reason, `${label}.reason`);
  requireJsonNonNegativeInteger(denial.row, `${label}.row`);
}

function verifyCommittedAuthority(repoRoot = REPOSITORY_ROOT) {
  const manifestPath = path.join(
    repoRoot,
    'src/content/tech-center/authority/import-manifest.json'
  );
  const ledgerPath = path.join(repoRoot, 'src/content/tech-center/authority/decision-ledger.json');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(ledgerPath)) {
    throw new Error('Technical content authority is missing its manifest or decision ledger');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  assertExactKeys(manifest, ['schemaVersion', 'source', 'pages'], 'committed import manifest');
  assertExactKeys(
    ledger,
    ['schemaVersion', 'corrections', 'denials', 'approvedExceptions'],
    'committed decision ledger'
  );
  assertExactKeys(
    manifest.source,
    ['file', 'format', 'sha256', 'acceptedCount', 'deniedCount'],
    'committed import manifest source'
  );
  requireText(manifest.source.file, 'committed import manifest source.file');
  if (manifest.source.format !== 'json' && manifest.source.format !== 'xlsx') {
    throw new Error(
      `Schema drift in committed import manifest source.format: ${manifest.source.format}`
    );
  }
  assertHash(manifest.source.sha256, 'committed import manifest source.sha256');
  requireJsonNonNegativeInteger(
    manifest.source.acceptedCount,
    'committed import manifest source.acceptedCount'
  );
  requireJsonNonNegativeInteger(
    manifest.source.deniedCount,
    'committed import manifest source.deniedCount'
  );
  if (manifest.schemaVersion !== 1 || ledger.schemaVersion !== 1)
    throw new Error('Unsupported technical content authority schema version');
  if (!Array.isArray(manifest.pages))
    throw new Error('Schema drift in committed import manifest pages: expected an array');
  if (manifest.source.acceptedCount !== manifest.pages.length) {
    throw new Error('Technical content manifest count drift: acceptedCount differs from pages');
  }
  if (manifest.source.acceptedCount !== EXPECTED_ACCEPTED_COUNT) {
    throw new Error(
      [
        'Technical content accepted count drift: expected ',
        EXPECTED_ACCEPTED_COUNT,
        ', found ',
        manifest.source.acceptedCount
      ].join('')
    );
  }
  assertExpectedOperationCounts(manifest.pages, 'Technical content operation count');
  if (!Array.isArray(ledger.corrections) || !Array.isArray(ledger.denials))
    throw new Error(
      'Schema drift in committed decision ledger: correction and denial arrays required'
    );
  if (!Array.isArray(ledger.approvedExceptions))
    throw new Error(
      'Schema drift in committed decision ledger: approvedExceptions must be an array'
    );
  if (manifest.source.deniedCount !== ledger.denials.length) {
    throw new Error(
      [
        `Technical content denial count drift: manifest declares ${manifest.source.deniedCount}, `,
        `ledger contains ${ledger.denials.length}`
      ].join('')
    );
  }
  if (manifest.source.deniedCount !== EXPECTED_DENIED_COUNT) {
    throw new Error(
      [
        'Technical content denied count drift: expected ',
        EXPECTED_DENIED_COUNT,
        ', found ',
        manifest.source.deniedCount
      ].join('')
    );
  }
  manifest.pages.forEach(validateManifestPage);
  ledger.corrections.forEach(validateLedgerCorrection);
  ledger.denials.forEach(validateLedgerDenial);
  validateIdentitySet(manifest.pages.map((page) => page.identity));
  const correctionKeys = new Set();
  for (const correction of ledger.corrections) {
    if (!CORRECTION_FIELDS.has(correction.field)) {
      throw new Error(
        [
          'Schema drift in committed decision ledger: unsupported correction field ',
          correction.field
        ].join('')
      );
    }
    const key = `${foldIdentity(correction.identity)}|${correction.field}`;
    if (correctionKeys.has(key)) {
      throw new Error(
        [
          'Undeclared duplicate correction: ',
          correction.identity.locale,
          correction.identity.canonicalPath,
          ' ',
          correction.field
        ].join('')
      );
    }
    correctionKeys.add(key);
  }
  const denialKeys = new Set();
  for (const denial of ledger.denials) {
    const key = foldIdentity(denial.identity);
    if (denialKeys.has(key)) {
      throw new Error(
        [
          'Undeclared duplicate denial: ',
          denial.identity.locale,
          denial.identity.canonicalPath
        ].join('')
      );
    }
    denialKeys.add(key);
  }
  const entries = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'src/components/tech-center/entries.json'), 'utf8')
  );
  if (!Array.isArray(entries)) throw new Error('Technical content registry must be an array');
  if (entries.length !== EXPECTED_TECHNICAL_PAGE_COUNT) {
    throw new Error(
      [
        `Technical content registry count drift: expected ${EXPECTED_TECHNICAL_PAGE_COUNT}, `,
        `found ${entries.length}`
      ].join('')
    );
  }
  entries.forEach((entry, index) =>
    validateAuthorityProjection(entry, `technical content registry[${index}]`)
  );
  const searchPath = path.join(repoRoot, 'public/tech-center/search-index.json');
  if (!fs.existsSync(searchPath)) throw new Error('Technical content search projection is missing');
  const searchProjection = JSON.parse(fs.readFileSync(searchPath, 'utf8'));
  if (!Array.isArray(searchProjection)) {
    throw new Error('Technical content search projection must be an array');
  }
  if (searchProjection.length !== EXPECTED_TECHNICAL_PAGE_COUNT) {
    throw new Error(
      [
        'Technical content search projection count drift: expected ',
        EXPECTED_TECHNICAL_PAGE_COUNT,
        ', ',
        `found ${searchProjection.length}`
      ].join('')
    );
  }
  searchProjection.forEach((entry, index) =>
    validateSearchProjectionEntry(entry, `technical search projection[${index}]`)
  );
  validateIdentitySet(
    searchProjection.map((entry) => ({ locale: entry.locale, canonicalPath: entry.publicPath }))
  );
  const expectedSearchProjection = buildSearchProjection(entries);
  if (JSON.stringify(searchProjection) !== JSON.stringify(expectedSearchProjection)) {
    throw new Error('Technical content search projection drift');
  }
  assertDeniedIdentitiesAbsent(ledger.denials, entries, searchProjection);
  const entriesBySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  for (const page of manifest.pages) {
    const slug = `/${page.identity.locale}${page.identity.canonicalPath}`;
    const entry = entriesBySlug.get(slug);
    if (!entry || JSON.stringify(entry) !== JSON.stringify(page.projection)) {
      throw new Error(`Technical content projection drift for ${slug}`);
    }
    const filePath = path.join(repoRoot, page.normalizedBody.path);
    if (!fs.existsSync(filePath))
      throw new Error(`Technical content body projection is missing for ${slug}`);
    const parsed = parseFrontMatter(fs.readFileSync(filePath, 'utf8'), page.normalizedBody.path);
    if (parsed.metadata.slug !== slug)
      throw new Error(`Technical content body slug drift for ${slug}`);
    if (sha256(parsed.body) !== page.normalizedBody.sha256)
      throw new Error(`Technical content body hash drift for ${slug}`);
    validateBodyIntegrity(parsed.body, page.provenance, slug);
    if (SECRET_PATTERN.test(parsed.body))
      throw new Error(`Technical content body contains a secret-shaped value for ${slug}`);
    SECRET_PATTERN.lastIndex = 0;
  }
  for (const correction of ledger.corrections) {
    if (
      !manifest.pages.some(
        (page) => foldIdentity(page.identity) === foldIdentity(correction.identity)
      )
    ) {
      throw new Error(
        `Decision ledger references an unknown identity ${correction.identity.locale}${correction.identity.canonicalPath}`
      );
    }
  }
  console.log(`Technical content authority verified: ${manifest.pages.length} imported pages`);
  return manifest;
}

function printCheck(plan) {
  console.log(`Technical content check: ${plan.source.file} (${plan.source.format})`);
  for (const page of plan.pages) {
    console.log(
      `operation ${page.operation} ${page.identity.locale}${page.identity.canonicalPath}`
    );
  }
  for (const denial of plan.ledger.denials) {
    console.log(
      `denial ${denial.identity.locale}${denial.identity.canonicalPath} ${denial.reason}`
    );
  }
  console.log(
    `Proposed pages: ${plan.pages.length}; denials: ${plan.ledger.denials.length}; corrections: ${plan.ledger.corrections.length}`
  );
}

function parseArgs(argv) {
  let mode;
  let sourcePath;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--check' || token === '--write') {
      if (mode) throw new Error('Choose exactly one of --check or --write');
      mode = token.slice(2);
    } else if (token === '--source') {
      sourcePath = argv[++index];
      if (!sourcePath || sourcePath.startsWith('--'))
        throw new Error('--source requires a delivery directory or file');
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  if (!mode) throw new Error('Choose --check or --write');
  if (!sourcePath) throw new Error(`An explicit --source argument is required for --${mode}`);
  return { mode, sourcePath };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const plan = buildImportPlan({ repoRoot: REPOSITORY_ROOT, sourcePath: options.sourcePath });
  if (options.mode === 'check') {
    verifyImportPlanNoDrift(plan);
    printCheck(plan);
    return;
  }
  validateImportPlanPolicy(plan);
  verifyCommittedAuthority();
  writeImportPlan(plan);
  verifyCommittedAuthority();
  console.log(`Technical content import written: ${plan.pages.length} pages`);
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
  buildImportPlan,
  buildNormalizedTechnicalPage,
  buildSearchProjection,
  foldIdentity,
  main,
  assertDeniedIdentitiesAbsent,
  verifyImportPlanNoDrift,
  writeImportPlan,
  validateIdentitySet,
  validateImportPlanPolicy,
  verifyCommittedAuthority
};
