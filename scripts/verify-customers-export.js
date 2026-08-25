#!/usr/bin/env node
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const outDir = path.resolve(rootDir, process.argv[2] || 'out');
const solutionsDir = path.join(rootDir, 'content', 'customers', 'solutions');
const forbiddenContent = [
  'AI 可读解决方案正文',
  'FastGPT 客户案例中心 AI 可读目录',
  '/api/cta/click',
  'NEXT_PUBLIC_AI_GATEWAY_KEY',
  'AI 智能匹配案例'
];
const forbiddenBundleContent = [
  '/api/cta/click',
  'NEXT_PUBLIC_AI_GATEWAY_KEY',
  'AI 智能匹配案例'
];

function walkFiles(dir, extension) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(file, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [file] : [];
  });
}

function countOccurrences(source, token) {
  return source.split(token).length - 1;
}

const solutionFiles = walkFiles(solutionsDir, '.json');
assert(solutionFiles.length > 0, 'Customer export verification requires solution data');

for (const sourceFile of solutionFiles) {
  const solution = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const htmlFile = path.join(outDir, 'customers', solution.categorySlug, `${solution.slug}.html`);
  assert(fs.existsSync(htmlFile), `Missing customer detail export: ${htmlFile}`);

  const html = fs.readFileSync(htmlFile, 'utf8');
  assert.equal(
    countOccurrences(html, 'id="solution-article"'),
    1,
    `Customer detail must contain one rendered article: ${htmlFile}`
  );
  for (const token of forbiddenContent) {
    assert(
      !html.includes(token),
      `Customer detail contains forbidden content ${token}: ${htmlFile}`
    );
  }
}

const homeFile = path.join(outDir, 'customers.html');
assert(fs.existsSync(homeFile), `Missing customer home export: ${homeFile}`);
const homeHtml = fs.readFileSync(homeFile, 'utf8');
for (const token of forbiddenContent) {
  assert(!homeHtml.includes(token), `Customer home contains forbidden content ${token}`);
}

const chunksDir = path.join(outDir, '_next', 'static', 'chunks');
assert(fs.existsSync(chunksDir), `Missing customer JavaScript chunks: ${chunksDir}`);
for (const chunkFile of walkFiles(chunksDir, '.js')) {
  const source = fs.readFileSync(chunkFile, 'utf8');
  for (const token of forbiddenBundleContent) {
    assert(!source.includes(token), `Customer JavaScript contains forbidden content ${token}`);
  }
}

console.log(`Customer export verification passed: ${solutionFiles.length} detail pages`);
