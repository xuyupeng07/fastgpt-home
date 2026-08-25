#!/usr/bin/env node

/**
 * Run the complete source and static-export release gate without third-party dependencies.
 *
 * Source mode stays runnable on development volumes. Full mode requires a case-sensitive
 * filesystem because mixed-case FAQ slugs are part of the published URL contract.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { URL_ALIAS_CONTRACT } = require('./lib/url-alias-authority');
const {
  verifyUrlAliasArtifactBundle,
  writeUrlAliasArtifactBundle
} = require('./lib/url-alias-artifacts');
const { siteVariants } = require('./lib/site-variant');
const {
  GENERATED_PUBLIC_PATHS,
  addRollbackFile,
  commandLabel,
  createFailure,
  loadSolutionsEvidence
} = require('./lib/release-cross-project');
const {
  assertCaseSensitiveFilesystem,
  clearBuildArtifacts,
  recordVariantArtifactInventory,
  recordVariantExportRollbackInventory,
  recordVariantRollbackInventory,
  restoreGeneratedPublicFiles,
  retainFailureArtifacts,
  retainSuccessArtifacts,
  snapshotGeneratedPublicFiles,
  variantEnvironment,
  verifyExportCardinality
} = require('./lib/release-artifacts');
const {
  createReleaseRecord,
  finalizeReleaseRecord,
  formatTechnicalAuthoritySuccess,
  recordStep,
  recordVariantOutcome,
  writeReleaseRecord
} = require('./lib/release-record');

const ROOT = path.resolve(__dirname, '..');
const RETAIN_DIR = path.join(ROOT, '.release-artifacts');
const P1_BASELINE_KIB = 266.9;
const P1_BUDGET_KIB = 260;

function parseArgs(argv) {
  const options = {
    sourceOnly: false,
    keepArtifacts: false,
    retainSuccessArtifacts: undefined,
    variant: undefined
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--source-only') options.sourceOnly = true;
    else if (token === '--keep-artifacts') options.keepArtifacts = true;
    else if (token === '--allow-missing-solutions-evidence') {
      options.allowMissingSolutionsEvidence = true;
    } else if (token === '--live') options.live = true;
    else if (token === '--retain-success-artifacts') {
      const retainDir = argv[++index];
      if (!retainDir || retainDir.startsWith('--'))
        throw new Error('--retain-success-artifacts requires a directory');
      options.retainSuccessArtifacts = path.resolve(ROOT, retainDir);
    } else if (token === '--variant') {
      const variant = argv[++index];
      if (!siteVariants.includes(variant)) {
        throw new Error(`--variant requires one of: ${siteVariants.join(', ')}`);
      }
      options.variant = variant;
    } else if (token === '--solutions-evidence' || token === '--solutions-preview-evidence') {
      const evidencePath = argv[++index];
      if (!evidencePath || evidencePath.startsWith('--')) {
        throw new Error(`${token} requires a JSON file path`);
      }
      options.solutionsEvidence = evidencePath;
    } else if (token === '--solutions-http-target') {
      const target = argv[++index];
      if (!target || target.startsWith('--')) throw new Error(`${token} requires an HTTPS URL`);
      options.solutionsHttpTarget = target;
    } else if (token === '--solutions-http-contract') {
      const contractPath = argv[++index];
      if (!contractPath || contractPath.startsWith('--')) {
        throw new Error(`${token} requires a JSON file path`);
      }
      options.solutionsHttpContract = contractPath;
    } else if (token === '--solutions-approved-target') {
      const target = argv[++index];
      if (!target || target.startsWith('--')) throw new Error(`${token} requires an HTTPS URL`);
      options.solutionsApprovedTarget = target;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  if (options.solutionsEvidence && (options.solutionsHttpTarget || options.solutionsHttpContract)) {
    throw new Error(
      '--solutions-evidence cannot be combined with --solutions-http-target or --solutions-http-contract'
    );
  }
  if (options.solutionsHttpTarget !== undefined && options.solutionsHttpContract === undefined) {
    throw new Error('--solutions-http-target requires --solutions-http-contract');
  }
  if (options.solutionsHttpContract !== undefined && options.solutionsHttpTarget === undefined) {
    throw new Error('--solutions-http-contract requires --solutions-http-target');
  }
  return options;
}

function runStep(failures, stepId, label, command, args, env, variant, formatSuccess, record) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.error || result.status !== 0) {
    const failureOutput = result.error ? `${output}\n${result.error.message}` : output;
    recordStep(
      record,
      stepId,
      label,
      commandLabel(command, args),
      variant,
      'failed',
      failureOutput
    );
    failures.push(createFailure(stepId, label, command, args, failureOutput, variant));
    console.error(`[verify-release] ${label} failed`);
    return false;
  }
  const successEvidence = formatSuccess ? formatSuccess(output) : undefined;
  recordStep(
    record,
    stepId,
    label,
    commandLabel(command, args),
    variant,
    'passed',
    output,
    successEvidence
  );
  console.log(`[verify-release] ${label} passed${successEvidence ? `: ${successEvidence}` : ''}`);
  return true;
}

function nodeStep(failures, stepId, label, script, args, env, variant, record, formatSuccess) {
  return runStep(
    failures,
    stepId,
    label,
    process.execPath,
    [script, ...args],
    env,
    variant,
    formatSuccess,
    record
  );
}

function npmStep(failures, stepId, label, args, env, variant, formatSuccess, record) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return runStep(
    failures,
    stepId,
    label,
    npm,
    ['run', ...args],
    env,
    variant,
    formatSuccess,
    record
  );
}

function getSourceNodeSteps() {
  return [
    [
      'solutions-preview.regression',
      'Solutions preview runner regression',
      'scripts/lib/solutions-preview-http.test.js',
      []
    ],
    ['seo-basics.regression', 'SEO basics regression', 'scripts/verify-seo-basics.test.js', []],
    [
      'content-hygiene.source',
      'content hygiene source verification',
      'scripts/verify-content-hygiene.js',
      ['--mode', 'source']
    ],
    [
      'faq-route-registry.source',
      'route registry check',
      'scripts/generate-faq-route-registry.js',
      ['--check']
    ],
    [
      'faq-metadata-snapshot.source',
      'metadata snapshot check',
      'scripts/generate-faq-metadata.js',
      ['--check']
    ],
    ['faq-routes.source', 'FAQ route source verification', 'scripts/verify-faq-routes.js', []],
    [
      'faq-metadata-legacy.source',
      'FAQ metadata source verification',
      'scripts/verify-faq-metadata.js',
      []
    ],
    [
      'faq-metadata.source',
      'FAQ metadata normalization source verification',
      'scripts/verify-faq-metadata-authority.js',
      []
    ],
    [
      'faq-seo-graph.source',
      'FAQ SEO graph source verification',
      'scripts/verify-faq-seo-graph.js',
      []
    ],
    [
      'url-alias.source',
      'URL Alias Authority source verification',
      'scripts/verify-url-alias-authority.js',
      []
    ],
    [
      'case-only.source',
      'case-only authority and projection source verification',
      'scripts/verify-case-only-aliases.js',
      []
    ],
    [
      'url-alias.rebuilt-source',
      'URL Alias rebuilt-slug authority and projection source verification',
      'scripts/verify-rebuilt-slug-aliases.js',
      []
    ],
    [
      'faq-redirects.source',
      'FAQ redirect source verification',
      'scripts/verify-faq-redirects.js',
      ['--source']
    ],
    [
      'technical-authority.source',
      'technical authority source verification',
      'scripts/verify-technical-authority.js',
      []
    ],
    [
      'technical-wave.source',
      'technical wave source verification',
      'scripts/verify-technical-wave.js',
      []
    ]
  ];
}

function getSourceNpmSteps() {
  return [
    [
      'technical-content.source',
      'technical content authority verification',
      ['verify:technical-content']
    ],
    [
      'technical-authority.regression',
      'technical authority regression',
      ['verify:technical-authority-regression']
    ],
    [
      'technical-wave.regression',
      'technical wave regression',
      ['verify:technical-wave-regression']
    ],
    [
      'technical-content.regression',
      'technical content regression',
      ['verify:technical-content-regression']
    ],
    [
      'technical-center.regression',
      'technical center regression',
      ['verify:technical-center-regression']
    ],
    [
      'technical-export.regression',
      'technical export regression',
      ['verify:technical-export-regression']
    ],
    ['url-alias.regression', 'URL Alias Authority regression', ['verify:url-alias-regression']],
    ['case-only.regression', 'case-only slice regression', ['verify:case-only-regression']],
    [
      'url-alias.rebuilt-regression',
      'URL Alias rebuilt-slug slice regression',
      ['verify:rebuilt-slug-regression']
    ],
    [
      'faq-metadata.regression',
      'FAQ metadata normalization regression',
      ['verify:faq-metadata-authority-regression']
    ],
    ['release-readiness.regression', 'release readiness regression', ['verify:release-readiness']]
  ];
}

function getSourceExecutionOrder() {
  return [
    ...getSourceNodeSteps().map(([stepId]) => stepId),
    ...getSourceNpmSteps().map(([stepId]) => stepId),
    'lint.source',
    'typescript.source',
    'guide-authorization.source',
    'guide-authorization.regression',
    'guide-content.source'
  ];
}

function runSourceChecks(failures, env, record) {
  for (const [stepId, label, script, args] of getSourceNodeSteps()) {
    const formatSuccess =
      stepId === 'technical-authority.source' ? formatTechnicalAuthoritySuccess : undefined;
    nodeStep(failures, stepId, label, script, args, env, undefined, record, formatSuccess);
  }

  for (const [stepId, label, args] of getSourceNpmSteps()) {
    const formatSuccess =
      stepId === 'technical-authority.regression' ? formatTechnicalAuthoritySuccess : undefined;
    npmStep(failures, stepId, label, args, env, undefined, formatSuccess, record);
  }
  npmStep(
    failures,
    'lint.source',
    'Lint source verification',
    ['lint'],
    env,
    undefined,
    undefined,
    record
  );
  runStep(
    failures,
    'typescript.source',
    'TypeScript source verification',
    'npx',
    ['--no-install', 'tsc', '--noEmit', '--incremental', 'false'],
    env,
    undefined,
    undefined,
    record
  );
  const technicalAuthority = record?.evidence.technicalAuthority;
  if (
    technicalAuthority?.observed?.governanceStatus === 'governance-complete' &&
    technicalAuthority.observed.publicationCount === 0
  ) {
    console.log('[verify-release] Wave 0 governance-complete; publication-count=0');
  }
}

function runGuideSourceChecks(failures, env, variant, record) {
  const suffix = variant ? ` (${variant})` : '';
  if (!variant) {
    nodeStep(
      failures,
      'guide-authorization.source',
      'Guide authorization source verification',
      'scripts/verify-guide-authorization.js',
      [],
      env,
      undefined,
      record
    );
    npmStep(
      failures,
      'guide-authorization.regression',
      'Guide authorization regression',
      ['verify:guide-authorization-regression'],
      env,
      undefined,
      undefined,
      record
    );
  }
  nodeStep(
    failures,
    'guide-content.source',
    `Guide content source verification${suffix}`,
    'scripts/verify-guide-content.js',
    [],
    env,
    variant,
    record
  );
}

function extractP1SuccessMeasurement(output) {
  return output.match(
    /P1 verification passed for .*:\s*([0-9.]+ KiB initial JavaScript gzip)/
  )?.[1];
}

function getVariantSteps(variant) {
  const steps = [
    {
      runner: 'node',
      id: 'content-hygiene.html',
      label: `Complete HTML hygiene (${variant})`,
      command: 'scripts/verify-content-hygiene.js',
      args: ['--mode', 'html', '--root', 'out', '--variant', variant]
    },
    {
      runner: 'npm',
      id: 'technical-center.export',
      label: `technical center artifact verification (${variant})`,
      args: ['verify:technical-center']
    },
    {
      runner: 'npm',
      id: 'technical-export.export',
      label: `technical export artifact verification (${variant})`,
      args: ['verify:technical-export']
    },
    {
      runner: 'npm',
      id: 'technical-wave.export',
      label: `technical wave export verification (${variant})`,
      args: ['verify:technical-wave', '--', '--export', '--variant', variant, '--out-dir', 'out']
    },
    ...(variant === 'preview'
      ? []
      : [
          {
            runner: 'node',
            id: 'url-alias.blackbox',
            label: `URL Alias black-box verification (${variant})`,
            command: 'scripts/verify-url-alias-blackbox.js',
            args: ['--variant', variant]
          },
          {
            runner: 'node',
            id: 'case-only.http',
            label: `Case-only HTTP verification (${variant})`,
            command: 'scripts/verify-url-alias-blackbox.js',
            args: ['--variant', variant, '--slice', 'case-only']
          }
        ]),
    {
      runner: 'npm',
      id: 'p0.export',
      label: `P0 HTML verification (${variant})`,
      args: ['verify:p0']
    },
    {
      runner: 'npm',
      id: 'p1.export',
      label: `P1 HTML verification (${variant})`,
      args: ['verify:p1'],
      formatSuccess: extractP1SuccessMeasurement
    },
    {
      runner: 'npm',
      id: 'p2.export',
      label: `P2 HTML verification (${variant})`,
      args: ['verify:p2']
    },
    {
      runner: 'npm',
      id: 'i18n-seo.export',
      label: `i18n SEO HTML verification (${variant})`,
      args: ['verify:i18n-seo']
    },
    ...(variant === 'preview'
      ? []
      : [
          {
            runner: 'npm',
            id: 'faq-metadata-legacy.html',
            label: `FAQ metadata HTML verification (${variant})`,
            args: ['verify:faq-metadata', '--', '--html', '--variant', variant]
          },
          {
            runner: 'npm',
            id: 'faq-metadata.html',
            label: `FAQ metadata normalization HTML verification (${variant})`,
            args: ['verify:faq-metadata-authority', '--', '--html', '--variant', variant]
          },
          {
            runner: 'npm',
            id: 'faq-seo-graph.html',
            label: `FAQ SEO graph HTML verification (${variant})`,
            args: ['verify:faq-seo-graph', '--', '--html', '--out-dir', 'out', '--variant', variant]
          },
          {
            runner: 'npm',
            id: 'faq-redirects.export',
            label: `FAQ redirect artifact verification (${variant})`,
            args: ['verify:faq-redirects']
          }
        ])
  ];
  return steps;
}

function getVariantExecutionOrder(variant) {
  return [
    'variant.build',
    ...getVariantSteps(variant).map((step) => step.id),
    'faq.export-cardinality',
    'guide.export'
  ];
}

function runVariantChecks(failures, variant, env, record) {
  const commandStart = record?.commands.length || 0;
  const buildPassed = npmStep(
    failures,
    'variant.build',
    `build ${variant}`,
    ['build'],
    env,
    variant,
    undefined,
    record
  );
  if (!buildPassed) {
    recordVariantOutcome(record, variant, failures, commandStart);
    return false;
  }

  for (const step of getVariantSteps(variant)) {
    if (step.runner === 'node') {
      nodeStep(
        failures,
        step.id,
        step.label,
        step.command,
        step.args,
        env,
        variant,
        record,
        step.formatSuccess
      );
      continue;
    }
    npmStep(failures, step.id, step.label, step.args, env, variant, step.formatSuccess, record);
  }

  try {
    verifyExportCardinality(variant);
    recordStep(
      record,
      'faq.export-cardinality',
      `export cardinality (${variant})`,
      'in-process static export cardinality check',
      variant,
      'passed',
      'FAQ HTML and sitemap cardinality matched the release contract'
    );
    console.log(`[verify-release] export cardinality (${variant}) passed`);
  } catch (error) {
    failures.push({
      id: 'faq.export-cardinality',
      label: `export cardinality (${variant})`,
      variant,
      command: 'in-process static export cardinality check',
      output: error.message
    });
    recordStep(
      record,
      'faq.export-cardinality',
      `export cardinality (${variant})`,
      'in-process static export cardinality check',
      variant,
      'failed',
      error.message
    );
    console.error(`[verify-release] export cardinality (${variant}) failed`);
  }

  if (variant === 'preview') {
    nodeStep(
      failures,
      'guide.export',
      `Guide export artifact verification (${variant})`,
      'scripts/verify-guide-preview.js',
      ['--out-dir', 'out'],
      env,
      variant,
      record
    );
  } else {
    nodeStep(
      failures,
      'guide.export',
      `Guide export artifact verification (${variant})`,
      'scripts/verify-guide-export.js',
      ['--out-dir', 'out', '--variant', variant],
      env,
      variant,
      record,
      (output) => {
        const match = output.match(
          /Guide HTML verified: (\d+) pages, (\d+) sitemap URLs \(tracer=([^)]+)\)/
        );
        return match ? `tracer=${match[3]} pages=${match[1]} sitemapUrls=${match[2]}` : undefined;
      }
    );
  }
  recordVariantOutcome(record, variant, failures, commandStart);
  return true;
}

function appendP1HistoricalBaselineAdvisories(failures, startIndex, advisories) {
  for (const failure of failures.slice(startIndex)) {
    const budgetMatch = failure.output.match(
      /Initial JavaScript is ([0-9.]+) KiB gzip, budget is 260 KiB/
    );
    if (failure.id !== 'p1.export' || !budgetMatch) continue;
    const currentKib = Number.parseFloat(budgetMatch[1]);
    const deltaKib = currentKib - P1_BASELINE_KIB;
    advisories.push({
      ...failure,
      label: 'P1 historical baseline comparison',
      output:
        `current=${currentKib.toFixed(1)} KiB gzip; c77cf48 APFS baseline=${P1_BASELINE_KIB.toFixed(
          1
        )} KiB gzip; ` +
        `delta=${deltaKib >= 0 ? '+' : ''}${deltaKib.toFixed(
          1
        )} KiB; budget=${P1_BUDGET_KIB} KiB; ` +
        `command=${failure.command}; variant=${failure.variant}`
    });
  }
}

function reportFailures(failures, advisories, retainedPaths) {
  if (!failures.length && !advisories.length) return;
  if (failures.length) console.error(`\n[verify-release] failed with ${failures.length} check(s)`);
  for (const failure of failures) {
    console.error(`\n- ${failure.label}${failure.variant ? ` [variant=${failure.variant}]` : ''}`);
    console.error(`  command: ${failure.command}`);
    console.error(`  evidence:\n${failure.output}`);
  }
  if (advisories.length) {
    console.warn(`\n[verify-release] known advisory checks (${advisories.length})`);
    for (const advisory of advisories) {
      console.warn(
        `\n- ${advisory.label}${advisory.variant ? ` [variant=${advisory.variant}]` : ''}`
      );
      console.warn(`  command: ${advisory.command}`);
      console.warn(`  evidence: ${advisory.output}`);
    }
  }
  if (failures.length) {
    if (retainedPaths.length) {
      console.error(`\n[verify-release] retained failure artifacts: ${retainedPaths.join(', ')}`);
    } else {
      console.error(
        '[verify-release] rerun with --keep-artifacts to retain failing .next/out evidence'
      );
    }
  }
}

function runReleaseRegressionChecks(failures, env, record) {
  npmStep(
    failures,
    'release.regression',
    'release coordinator regression',
    ['verify:release-regression'],
    env,
    undefined,
    undefined,
    record
  );
}

function isReleaseGateBlocked(failures, solutionsEvidence, options = {}) {
  if (failures.length) return true;
  if (solutionsEvidence.claim === true) return false;
  return !(
    options.allowMissingSolutionsEvidence === true && solutionsEvidence.status === 'not-provided'
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const failures = [];
  const advisories = [];
  const retainedPaths = [];
  const record = createReleaseRecord(options);
  // Source-only checks run inside release regressions; preserve any full release record they inspect.
  if (!options.keepArtifacts && !options.sourceOnly) {
    fs.rmSync(RETAIN_DIR, { recursive: true, force: true });
  }
  loadSolutionsEvidence(record, options);
  addRollbackFile(
    record,
    'src/content/tech-center/authority/week05-wave1-release-manifest.json',
    'technical-wave-release-manifest',
    record.startedAt
  );
  addRollbackFile(
    record,
    'src/content/tech-center/authority/week05-wave1-rollback.json',
    'technical-wave-rollback',
    record.startedAt
  );
  for (const [relativePath, role] of [
    ['src/faq/generated-en-route-registry.json', 'faq-route-registry'],
    ['src/faq/generated-en-metadata.json', 'faq-metadata-projection'],
    ['src/faq/generated-en-metadata-authority.json', 'faq-metadata-authority'],
    ['src/content/guides/registry.json', 'guide-registry'],
    ['src/content/guides/policy.json', 'guide-release-policy'],
    ['src/content/guides/authorization.json', 'guide-authorization']
  ]) {
    addRollbackFile(record, relativePath, role, record.startedAt);
  }
  const snapshot = snapshotGeneratedPublicFiles();
  const sourceEnv = {
    ...process.env,
    CI: process.env.CI || '1',
    NEXT_PUBLIC_SITE_VARIANT: process.env.NEXT_PUBLIC_SITE_VARIANT || 'io',
    NEXT_PUBLIC_HOME_URL: process.env.NEXT_PUBLIC_HOME_URL || 'https://fastgpt.io',
    NEXT_PUBLIC_CN_HOME_URL: process.env.NEXT_PUBLIC_CN_HOME_URL || 'https://fastgpt.cn',
    NEXT_PUBLIC_IO_HOME_URL: process.env.NEXT_PUBLIC_IO_HOME_URL || 'https://fastgpt.io'
  };

  try {
    runSourceChecks(failures, sourceEnv, record);
    runGuideSourceChecks(failures, sourceEnv, undefined, record);
    if (failures.length || options.sourceOnly) {
      reportFailures(failures, advisories, retainedPaths);
      if (!failures.length) {
        console.log(
          '[verify-release] source-only checks passed; full mode requires a case-sensitive filesystem'
        );
      }
      process.exitCode = failures.length ? 1 : 0;
      return;
    }

    runReleaseRegressionChecks(failures, sourceEnv, record);
    if (failures.length) {
      reportFailures(failures, advisories, retainedPaths);
      process.exitCode = 1;
      return;
    }

    try {
      assertCaseSensitiveFilesystem();
      recordStep(
        record,
        'filesystem.case-sensitive',
        'case-sensitive filesystem policy',
        'in-process case-sensitive filesystem probe',
        undefined,
        'passed',
        'Published route collision probe passed'
      );
      console.log('[verify-release] case-sensitive filesystem probe passed');
    } catch (error) {
      recordStep(
        record,
        'filesystem.case-sensitive',
        'case-sensitive filesystem policy',
        'in-process case-sensitive filesystem probe',
        undefined,
        'failed',
        error.message
      );
      failures.push({
        id: 'filesystem.case-sensitive',
        label: 'case-sensitive filesystem policy',
        command: 'in-process case-sensitive filesystem probe',
        output: error.message
      });
      clearBuildArtifacts();
      reportFailures(failures, advisories, retainedPaths);
      process.exitCode = 1;
      return;
    }

    const variants = options.variant ? [options.variant] : siteVariants;
    for (const variant of variants) {
      clearBuildArtifacts();
      const env = variantEnvironment(variant);
      const beforeFailures = failures.length;
      runGuideSourceChecks(failures, env, variant, record);
      runVariantChecks(failures, variant, env, record);
      recordVariantArtifactInventory(record, variant);
      appendP1HistoricalBaselineAdvisories(failures, beforeFailures, advisories);
      const variantFailed = failures.length > beforeFailures;
      if (!variantFailed && ['cn', 'io'].includes(variant)) {
        try {
          const bundle = writeUrlAliasArtifactBundle(ROOT, RETAIN_DIR, variant);
          verifyUrlAliasArtifactBundle(path.join(RETAIN_DIR, 'url-alias'), [variant]);
          record.evidence.aliasContract.artifacts[variant] = {
            status: 'passed',
            path: path.relative(ROOT, bundle.root),
            authorityDigest: bundle.releaseManifest.authority.digest,
            authoritySha256: bundle.authoritySha256,
            projectionSha256: bundle.projectionSha256
          };
          recordVariantRollbackInventory(record, variant);
          console.log(`[verify-release] URL Alias ${variant} release/rollback artifacts passed`);
        } catch (error) {
          failures.push({
            id: 'url-alias.artifacts',
            label: `URL Alias release artifacts (${variant})`,
            variant,
            command: 'in-process URL Alias release artifact generation',
            output: error.message
          });
          record.evidence.aliasContract.artifacts[variant] = {
            status: 'failed',
            detail: error.message
          };
        }
      }
      if (!variantFailed) recordVariantExportRollbackInventory(record, variant);
      if (variantFailed && options.keepArtifacts) {
        try {
          retainedPaths.push(retainFailureArtifacts(variant));
        } catch (error) {
          failures.push({
            id: 'artifacts.retain-failure',
            label: `failure artifact retention (${variant})`,
            variant,
            command: 'in-process failure artifact copy',
            output: error.message
          });
        }
      }
      if (!variantFailed && options.retainSuccessArtifacts) {
        try {
          const retainedPath = retainSuccessArtifacts(variant, options.retainSuccessArtifacts);
          record.evidence.aliasContract.artifacts[variant] = {
            status: 'passed',
            path: path.relative(ROOT, path.join(retainedPath, 'url-alias', variant)),
            authorityDigest: JSON.parse(
              fs.readFileSync(
                path.join(retainedPath, 'url-alias', variant, 'release', 'manifest.json'),
                'utf8'
              )
            ).authority.digest
          };
          console.log(`[verify-release] retained verified ${variant} output: ${retainedPath}`);
        } catch (error) {
          failures.push({
            id: 'artifacts.retain-success',
            label: `success artifact retention (${variant})`,
            variant,
            command: 'in-process verified output copy',
            output: error.message
          });
        }
      }
      clearBuildArtifacts();
    }

    reportFailures(failures, advisories, retainedPaths);
    const solutionsEvidence = record.crossProjectInputs.solutionsPreviewHttp;
    const solutionsBlocked = solutionsEvidence.claim !== true;
    const missingSolutionsAllowed =
      options.allowMissingSolutionsEvidence === true && solutionsEvidence.status === 'not-provided';
    if (!failures.length && !solutionsBlocked) {
      console.log(
        `[verify-release] release gate passed for source, redirects, ${siteVariants.join(
          ', '
        )}, HTML, and sitemap evidence`
      );
    } else if (!failures.length && missingSolutionsAllowed) {
      console.log(
        '[verify-release] pull-request source and export gates passed; production release eligibility awaits Solutions preview HTTP evidence'
      );
    } else if (!failures.length && solutionsBlocked) {
      console.error('[verify-release] release gate blocked by Solutions preview HTTP evidence');
    }
    process.exitCode = isReleaseGateBlocked(failures, solutionsEvidence, options) ? 1 : 0;
  } finally {
    finalizeReleaseRecord(record, failures, options);
    if (!options.sourceOnly) {
      const recordPath = writeReleaseRecord(record);
      console.log(`[verify-release] verification record: ${recordPath}`);
    }
    restoreGeneratedPublicFiles(snapshot);
    if (!failures.length || !options.keepArtifacts) {
      clearBuildArtifacts();
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[verify-release] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  appendP1HistoricalBaselineAdvisories,
  createReleaseRecord,
  extractP1SuccessMeasurement,
  finalizeReleaseRecord,
  getSourceNodeSteps,
  getSourceNpmSteps,
  getSourceExecutionOrder,
  getVariantExecutionOrder,
  getVariantSteps,
  isReleaseGateBlocked,
  loadSolutionsEvidence,
  parseArgs
};
