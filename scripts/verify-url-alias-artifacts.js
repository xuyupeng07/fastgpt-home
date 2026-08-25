#!/usr/bin/env node

/** Verify URL Alias release and rollback bundles by provenance and SHA-256. */

const path = require('node:path');
const { verifyUrlAliasArtifactBundle } = require('./lib/url-alias-artifacts');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const options = { directory: path.join(ROOT, '.release-artifacts', 'url-alias') };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dir') options.directory = path.resolve(ROOT, argv[++index]);
    else throw new Error(`Unknown argument: ${token}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifests = verifyUrlAliasArtifactBundle(options.directory);
  const digests = Object.entries(manifests)
    .map(([variant, { release }]) => `${variant}=${release.authority.digest}`)
    .join(',');
  console.log(`[verify-url-alias-artifacts] passed (${digests})`);
}

try {
  main();
} catch (error) {
  console.error(`[verify-url-alias-artifacts] ${error.message}`);
  process.exitCode = 1;
}

module.exports = { parseArgs };
