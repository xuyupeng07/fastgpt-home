#!/usr/bin/env node

/**
 * Verify Wave 1 source and static-export projections across the supported site variants.
 */

const path = require('node:path');
const { verifyWaveExport, verifyWaveSource } = require('./lib/technical-wave');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const options = { export: false, outDir: null, variant: 'cn' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--export') {
      options.export = true;
    } else if (token === '--out-dir') {
      options.outDir = argv[++index];
      if (!options.outDir) throw new Error('--out-dir requires a path');
    } else if (token === '--variant') {
      options.variant = argv[++index];
      if (!['cn', 'io', 'preview'].includes(options.variant)) {
        throw new Error('--variant must be cn, io, or preview');
      }
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  if (options.outDir && !options.export) throw new Error('--out-dir requires --export');
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.export) {
    const result = verifyWaveSource(REPOSITORY_ROOT);
    console.log(
      '[verify-technical-wave] selection/evidence/identity/duplicate/security/operation-risk/content-hygiene/count checks passed'
    );
    console.log(`[verify-technical-wave] source-verified: ${JSON.stringify(result)}`);
    console.log(`WAVE1_RESULT=${JSON.stringify(result)}`);
    return result;
  }
  const result = verifyWaveExport(REPOSITORY_ROOT, {
    outDir: options.outDir ? path.resolve(options.outDir) : path.join(REPOSITORY_ROOT, 'out'),
    variant: options.variant
  });
  console.log(`[verify-technical-wave] export-verified (${options.variant})`);
  console.log(`WAVE1_RESULT=${JSON.stringify(result)}`);
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[verify-technical-wave] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs };
