const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { parseHttpsTarget, runSolutionsPreviewContract } = require('./solutions-preview-http');

test('Solutions preview runner validates HTTPS targets and records response checksums', async () => {
  assert.throws(() => parseHttpsTarget('http://preview.example.com'), /HTTPS/);
  assert.throws(() => parseHttpsTarget('https://127.0.0.1'), /public hostname/);
  assert.throws(() => parseHttpsTarget('https://[::]'), /public hostname/);
  await assert.rejects(
    () =>
      runSolutionsPreviewContract({
        target: 'https://preview.example.com',
        contract: { requests: [{ name: 'root', path: '//evil.example/path' }] }
      }),
    /absolute paths|Unsafe/
  );
  await assert.rejects(
    () =>
      runSolutionsPreviewContract({
        target: 'https://preview.example.com',
        contract: {
          requests: [
            { name: 'root', path: '/' },
            { name: 'root', path: '/duplicate' }
          ]
        }
      }),
    /request names must be unique/
  );
  const requiredRequests = [
    'root',
    'routes',
    'robots',
    'sitemap',
    'canonical',
    'internal-links',
    'projections'
  ].map((name) => ({
    name,
    path:
      name === 'root'
        ? '/'
        : name === 'robots'
        ? '/robots.txt'
        : name === 'sitemap'
        ? '/sitemap.xml'
        : `/${name}`
  }));
  await assert.rejects(
    () =>
      runSolutionsPreviewContract({
        target: 'https://preview.example.com',
        contract: { requests: requiredRequests }
      }),
    /body assertions/
  );
  const originalFetch = global.fetch;
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solutions-preview-http-'));
  global.fetch = async (url) =>
    new Response(`<body>contract-ok ${url.pathname}<link rel="canonical" href="${url.href}">`, {
      status: 200,
      headers: {
        'x-robots-tag': 'noindex, nofollow',
        'content-type': 'text/plain',
        'x-api-key': 'secret',
        'set-cookie': 'session=secret'
      }
    });
  try {
    const result = await runSolutionsPreviewContract({
      target: 'https://preview.example.com',
      approvedTarget: 'https://preview.example.com',
      artifactDirectory: path.join(artifactRoot, 'responses'),
      contract: {
        repository: { url: 'https://github.com/example/solutions' },
        revision: 'abcdef1234567',
        approvedTarget: true,
        requests: [
          {
            name: 'root',
            path: '/',
            bodyIncludes: ['contract-ok']
          },
          { name: 'routes', path: '/routes', bodyIncludes: ['contract-ok'] },
          { name: 'robots', path: '/robots.txt', bodyIncludes: ['contract-ok'] },
          { name: 'sitemap', path: '/sitemap.xml', bodyIncludes: ['contract-ok'] },
          {
            name: 'canonical',
            path: '/canonical',
            canonical: 'https://preview.example.com/canonical'
          },
          { name: 'internal-links', path: '/links', bodyIncludes: ['contract-ok'] },
          {
            name: 'projections',
            path: '/projection.txt',
            bodyIncludes: ['contract-ok'],
            headers: {
              'x-robots-tag': 'noindex, nofollow',
              'content-type': 'text/plain'
            }
          }
        ]
      }
    });
    assert.equal(result.status, 'passed');
    assert.equal(result.checks.length, 7);
    assert.equal(result.artifacts.length, 7);
    assert.equal(result.responses.length, 7);
    assert.equal(
      fs
        .readFileSync(path.join(artifactRoot, result.responses.at(-1).artifactPath), 'utf8')
        .includes('canonical'),
      true
    );
    assert.equal(result.responses[0].headers['set-cookie'], undefined);
    assert.equal(result.responses[0].headers['x-api-key'], undefined);
    assert.match(result.artifacts[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal(fs.existsSync(path.join(artifactRoot, result.artifacts[0].path)), true);
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
});
