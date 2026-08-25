#!/usr/bin/env node

/** Generate the committed URL Alias Authority snapshot from the Week05 workbooks. */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { validateUrlAliasAuthority } = require('./lib/url-alias-authority');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'src', 'config', 'url-alias-authority.json');

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseArgs(argv) {
  const options = { ioWorkbook: undefined, cnWorkbook: undefined, output: OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--io-workbook') options.ioWorkbook = argv[++index];
    else if (token === '--cn-workbook') options.cnWorkbook = argv[++index];
    else if (token === '--output') options.output = path.resolve(ROOT, argv[++index]);
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.ioWorkbook || !options.cnWorkbook) {
    throw new Error('--io-workbook and --cn-workbook are required');
  }
  return options;
}

function decodeXml(value) {
  return value
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, number) => {
      const radix = number[0].toLowerCase() === 'x' ? 16 : 10;
      return String.fromCodePoint(parseInt(radix === 16 ? number.slice(1) : number, radix));
    })
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function readSheetRows(workbookPath, sheetName, sheetNumber) {
  const xml = execFileSync('unzip', ['-p', workbookPath, `xl/worksheets/sheet${sheetNumber}.xml`], {
    encoding: 'utf8'
  });
  return [...xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([^]*?)<\/row>/g)]
    .map((rowMatch) => {
      const cells = { row: Number(rowMatch[1]) };
      for (const cellMatch of rowMatch[2].matchAll(/<c[^>]*r="([A-Z]+)\d+"[^>]*>([^]*?)<\/c>/g)) {
        const value =
          cellMatch[2].match(/<t[^>]*>([^]*?)<\/t>/)?.[1] ??
          cellMatch[2].match(/<v[^>]*>([^]*?)<\/v>/)?.[1] ??
          '';
        cells[cellMatch[1]] = decodeXml(value);
      }
      return cells;
    })
    .filter((row) => row.row > 1);
}

function buildRecords(
  workbookPath,
  sheetName,
  sheetNumber,
  sourceColumn,
  targetColumn,
  noteColumn
) {
  const workbook = path.basename(workbookPath);
  const workbookSha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(workbookPath))
    .digest('hex');
  return readSheetRows(workbookPath, sheetName, sheetNumber).map((row) => {
    const source = new URL(row[sourceColumn]);
    const target = new URL(row[targetColumn]);
    if (source.search || source.hash || target.search || target.hash) {
      throw new Error(`Query or fragment found at ${workbook} row ${row.row}`);
    }
    const note = row[noteColumn] || '';
    const reason =
      source.hostname !== target.hostname
        ? 'cross-host'
        : /大小写/.test(note)
        ? 'case-only'
        : 'slug-rebuild';
    return {
      sourceHost: source.hostname,
      sourcePath: source.pathname,
      targetHost: target.hostname,
      targetPath: target.pathname,
      evidenceSource: workbook,
      workbookSha256,
      workbookSheet: sheetName,
      worksheetRow: row.row,
      businessNumber: row.A || row.B,
      reason,
      disposition: 'accepted',
      notes: note
    };
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const ioRecords = buildRecords(options.ioWorkbook, 'URL勘误-前两批', 2, 'C', 'D', 'E');
  const cnRecords = buildRecords(options.cnWorkbook, '需修正-指向404', 1, 'E', 'F', 'G');
  if (!ioRecords.length || !cnRecords.length) {
    throw new Error('Both workbooks must contain at least one URL correction row');
  }
  const records = [...ioRecords, ...cnRecords].sort((left, right) =>
    compareStrings(`${left.sourceHost}${left.sourcePath}`, `${right.sourceHost}${right.sourcePath}`)
  );
  const sourceKeys = new Set();
  for (const record of records) {
    const key = `${record.sourceHost}${record.sourcePath}`;
    if (sourceKeys.has(key)) throw new Error(`Duplicate source URL: ${key}`);
    sourceKeys.add(key);
  }
  const authority = {
    schemaVersion: 1,
    authority: 'url-alias',
    sources: [
      {
        workbook: path.basename(options.ioWorkbook),
        sha256: ioRecords[0].workbookSha256,
        sheet: 'URL勘误-前两批',
        acceptedRows: ioRecords.length
      },
      {
        workbook: path.basename(options.cnWorkbook),
        sha256: cnRecords[0].workbookSha256,
        sheet: '需修正-指向404',
        acceptedRows: cnRecords.length
      }
    ],
    recordCount: records.length,
    records
  };
  const validated = validateUrlAliasAuthority(authority, { requireEvidence: true });
  authority.records = validated.records;
  authority.recordCount = validated.records.length;
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(authority, null, 2)}\n`);
  console.log(
    `[generate-url-alias-authority] wrote ${records.length} records to ${options.output}`
  );
}

try {
  main();
} catch (error) {
  console.error(`[generate-url-alias-authority] ${error.message}`);
  process.exitCode = 1;
}
