const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const budget = require('./fixtures/technical-center-budget.json');
const { verifyTechnicalCenter } = require('./verify-technical-center');

const root = path.resolve(__dirname, '..');

function writeArtifact(
  articleCount,
  script = 'console.log("technical center");',
  registrySize = 100000
) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-center-budget-'));
  const chunkPath = path.join(outDir, '_next/static/chunks/app.js');
  fs.mkdirSync(path.dirname(chunkPath), { recursive: true });
  fs.writeFileSync(chunkPath, script);
  const registryPath = path.join(outDir, 'entries.json');
  const registry = Array.from({ length: registrySize }, (_, index) => ({
    slug: `/zh/technical-entry-${index}`
  }));
  fs.writeFileSync(registryPath, JSON.stringify(registry));
  const searchIndexPath = path.join(outDir, 'tech-center/search-index.json');
  fs.mkdirSync(path.dirname(searchIndexPath), { recursive: true });
  fs.writeFileSync(searchIndexPath, JSON.stringify(Array(registrySize).fill(null)));
  for (let index = 0; index < articleCount; index += 1) {
    const targetPath = path.join(outDir, 'zh', `technical-entry-${index}`, 'index.html');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, '<main>Technical entry</main>');
  }
  fs.writeFileSync(
    path.join(outDir, 'tech-center.html'),
    `<main data-registry-count="${registrySize}">${Array.from(
      { length: articleCount },
      (_, index) => `<article><a href="/zh/technical-entry-${index}">Entry ${index}</a></article>`
    ).join('')}</main><script src="/_next/static/chunks/app.js"></script>`
  );
  return { outDir, registryPath, searchIndexPath };
}

test('large registries keep the server listing and initial JavaScript bounded', () => {
  const { outDir, registryPath } = writeArtifact(budget.maxInitialEntries);
  try {
    const result = verifyTechnicalCenter({ outDir, registryPath });
    assert.equal(result.initialEntries, budget.maxInitialEntries);
    assert.equal(result.serverListingLinks.length, budget.maxInitialEntries);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('technical-center verifier rejects an initial JavaScript budget overrun', () => {
  const oversizedScript = 'x'.repeat(1024);
  const { outDir, registryPath } = writeArtifact(budget.maxInitialEntries, oversizedScript);
  try {
    assert.throws(
      () =>
        verifyTechnicalCenter({
          outDir,
          registryPath,
          baselineGzipBytes: 0,
          maxIncreaseBytes: 0
        }),
      /initial JavaScript is .* maximum is/
    );
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('technical-center verifier rejects an unbounded server listing', () => {
  const { outDir, registryPath } = writeArtifact(budget.maxInitialEntries + 1);
  try {
    assert.throws(
      () => verifyTechnicalCenter({ outDir, registryPath }),
      /initial listing has 13 entries; maximum is 12/
    );
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('technical-center verifier rejects a missing or stale search projection', () => {
  const registrySize = budget.maxInitialEntries + 1;
  const { outDir, registryPath, searchIndexPath } = writeArtifact(
    budget.maxInitialEntries,
    undefined,
    registrySize
  );
  try {
    fs.rmSync(searchIndexPath);
    assert.throws(
      () => verifyTechnicalCenter({ outDir, registryPath }),
      /Missing Technical Center search projection/
    );

    fs.writeFileSync(searchIndexPath, '[]');
    assert.throws(
      () => verifyTechnicalCenter({ outDir, registryPath }),
      new RegExp(`search projection has 0 entries; expected ${registrySize}`)
    );
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('technical-center verifier rejects a registry entry embedded in initial JavaScript', () => {
  const embeddedSlug = `/zh/technical-entry-${budget.maxInitialEntries}`;
  const { outDir, registryPath } = writeArtifact(budget.maxInitialEntries, embeddedSlug);
  try {
    assert.throws(
      () => verifyTechnicalCenter({ outDir, registryPath }),
      /is embedded in initial JavaScript/
    );
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('the route passes only a bounded projection and the client owns no registry import', () => {
  const routeSource = fs.readFileSync(
    path.join(root, 'src/app/[lang]/tech-center/page.tsx'),
    'utf8'
  );
  const clientSource = fs.readFileSync(
    path.join(root, 'src/components/tech-center/TechCenterPage.tsx'),
    'utf8'
  );

  assert.match(routeSource, /TECH_ENTRIES\.slice\(0, PAGE_SIZE\)\.map\(toTechSearchEntry\)/);
  assert.doesNotMatch(clientSource, /entries\.json|TECH_ENTRIES/);
  assert.match(clientSource, /value\.length !== expectedLength/);
  assert.match(clientSource, /new Set\(value\.map/);
});
