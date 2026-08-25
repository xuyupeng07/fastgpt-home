#!/usr/bin/env node

/** Run the owner-supplied Solutions HTTP contract and persist response bodies beside the evidence JSON. */

const fs = require('node:fs');
const path = require('node:path');
const { runSolutionsPreviewContract } = require('./lib/solutions-preview-http');

/** Parse the target, owner contract, and persistent evidence output path. */
function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!['--target', '--contract', '--output', '--approved-target'].includes(token)) {
      throw new Error(`Unknown argument: ${token}`);
    }
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`);
    options[token.slice(2)] = value;
  }
  if (!options.target || !options.contract)
    throw new Error('Usage: --target <https-url> --contract <json> [--output <json>]');
  return options;
}

/** Execute the HTTP contract and emit one machine-readable evidence document. */
async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const contractPath = path.resolve(options.contract);
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const outputPath = options.output ? path.resolve(options.output) : undefined;
  const result = await runSolutionsPreviewContract({
    target: options.target,
    approvedTarget: options['approved-target'],
    contract,
    artifactDirectory: outputPath
      ? path.join(
          path.dirname(outputPath),
          `${path.basename(outputPath, path.extname(outputPath))}-responses`
        )
      : undefined
  });
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output);
  }
  process.stdout.write(output);
  if (result.status === 'passed') {
    process.stderr.write(
      `[verify-solutions-preview-http] passed: ${result.responses.length} HTTP checks, ${result.artifacts.length} response artifacts\n`
    );
  }
  if (result.status !== 'passed') process.exitCode = 1;
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[verify-solutions-preview-http] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs };
