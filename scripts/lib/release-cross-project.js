const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  directoryInventory,
  fileProvenance,
  normalizeSolutionsEvidence,
  verifyResponseDirectory
} = require('./release-readiness');

const ROOT = path.resolve(__dirname, '../..');
const RETAIN_DIR = path.join(ROOT, '.release-artifacts');
const SOURCE_PROVENANCE_PATHS = [
  'src/config/site-routing.json',
  'src/config/url-alias-authority.json',
  'src/faq/generated-en-route-registry.json',
  'src/faq/generated-en-metadata.json',
  'src/faq/generated-en-metadata-authority.json',
  'src/content/guides/registry.json',
  'src/content/guides/policy.json',
  'src/content/guides/authorization.json',
  'src/lib/technical-content-policy.json',
  'src/components/tech-center/entries.json',
  'public/tech-center/search-index.json',
  'src/content/tech-center/authority/week05-authority.json',
  'src/content/tech-center/authority/week05-provenance.json',
  'src/content/tech-center/authority/week05-release-manifest.json',
  'src/content/tech-center/authority/week05-wave1-selection.json',
  'src/content/tech-center/authority/week05-wave1-manifest.json',
  'src/content/tech-center/authority/week05-wave1-release-manifest.json',
  'src/content/tech-center/authority/week05-wave1-rollback.json'
];
const GENERATED_PUBLIC_PATHS = [
  'public/llms.txt',
  'public/robots.txt',
  'public/ar/llms.txt',
  'public/en/llms.txt',
  'public/id/llms.txt',
  'public/ja/llms.txt',
  'public/ms/llms.txt',
  'public/th/llms.txt',
  'public/vi/llms.txt',
  'public/zh-hant/llms.txt',
  'public/zh/llms.txt'
];

function commandLabel(command, args) {
  return [command, ...args].join(' ');
}

function redactTarget(value) {
  if (typeof value !== 'string') return value;
  try {
    const target = new URL(value);
    target.username = '';
    target.password = '';
    target.search = '';
    target.hash = '';
    return target.href;
  } catch {
    return '<invalid-target>';
  }
}

function redactReleaseOptions(options) {
  return {
    ...options,
    ...(options.solutionsHttpTarget
      ? { solutionsHttpTarget: redactTarget(options.solutionsHttpTarget) }
      : {}),
    ...(options.solutionsApprovedTarget
      ? { solutionsApprovedTarget: redactTarget(options.solutionsApprovedTarget) }
      : {})
  };
}

function isInsideDirectory(directory, filePath) {
  const relative = path.relative(path.resolve(directory), path.resolve(filePath));
  return (
    relative === '' ||
    (!relative.startsWith('../') && relative !== '..' && !path.isAbsolute(relative))
  );
}

function persistExternalSolutionsEvidence(
  record,
  evidencePath,
  responseDirectory,
  provenance,
  normalizedEvidence
) {
  record.artifacts.push({
    variant: 'cross-project',
    ...provenance,
    role: 'cross-project-evidence-file'
  });
  const evidenceInside = isInsideDirectory(RETAIN_DIR, evidencePath);
  const responseDirectoryInside = isInsideDirectory(RETAIN_DIR, responseDirectory);
  if (evidenceInside && (responseDirectoryInside || !fs.existsSync(responseDirectory))) return;

  const persistRoot = path.join(RETAIN_DIR, 'cross-project', provenance.sha256.slice(0, 16));
  const persistedEvidencePath = path.join(persistRoot, 'evidence.json');
  fs.mkdirSync(persistRoot, { recursive: true });
  const persistedResponseDirectory = path.join(persistRoot, 'responses');
  let persistedEvidence = normalizedEvidence;
  if (fs.existsSync(responseDirectory) && !responseDirectoryInside) {
    fs.cpSync(responseDirectory, persistedResponseDirectory, { recursive: true, force: true });
    const sourceDirectoryRelative = path
      .relative(ROOT, responseDirectory)
      .replaceAll(path.sep, '/');
    const localArtifactPath = (artifactPath) => {
      const normalizedPath = artifactPath.replaceAll('\\', '/');
      const relativePath = normalizedPath.startsWith(`${sourceDirectoryRelative}/`)
        ? normalizedPath.slice(sourceDirectoryRelative.length + 1)
        : normalizedPath.startsWith('responses/')
        ? normalizedPath.slice('responses/'.length)
        : normalizedPath;
      return `responses/${relativePath}`;
    };
    persistedEvidence = {
      ...normalizedEvidence,
      artifacts: normalizedEvidence.artifacts.map((artifact) => ({
        ...artifact,
        path: localArtifactPath(artifact.path)
      })),
      responses: normalizedEvidence.responses.map((response) => {
        return {
          ...response,
          artifactPath: localArtifactPath(response.artifactPath)
        };
      })
    };
    record.artifacts.push({
      variant: 'cross-project',
      ...directoryInventory(persistedResponseDirectory, {
        root: ROOT,
        role: 'cross-project-http-responses-persisted',
        source: 'generated'
      })
    });
  }
  if (!evidenceInside || persistedEvidence !== normalizedEvidence) {
    fs.writeFileSync(persistedEvidencePath, `${JSON.stringify(persistedEvidence, null, 2)}\n`);
    record.artifacts.push({
      variant: 'cross-project',
      ...fileProvenance(persistedEvidencePath, {
        root: ROOT,
        role: 'cross-project-evidence-persisted',
        source: 'generated'
      })
    });
  }
}

function createFailure(stepId, label, command, args, output, variant) {
  return {
    id: stepId,
    label,
    variant,
    command: commandLabel(command, args),
    output: output.trim().slice(-8000) || '<no command output>'
  };
}

function collectSourceProvenance(capturedAt) {
  const paths = [...SOURCE_PROVENANCE_PATHS, ...GENERATED_PUBLIC_PATHS];
  return paths
    .filter((relativePath) => fs.existsSync(path.join(ROOT, relativePath)))
    .map((relativePath) =>
      fileProvenance(path.join(ROOT, relativePath), {
        root: ROOT,
        role: GENERATED_PUBLIC_PATHS.includes(relativePath) ? 'generated-public' : 'release-source',
        source: GENERATED_PUBLIC_PATHS.includes(relativePath) ? 'generated' : 'repository',
        capturedAt
      })
    );
}

function addRollbackFile(record, relativePath, role, capturedAt) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) return;
  record.rollback.inventory.push(
    fileProvenance(filePath, {
      root: ROOT,
      role,
      source: 'repository',
      capturedAt
    })
  );
}

function loadSolutionsEvidence(record, options) {
  const httpTarget = options.solutionsHttpTarget || process.env.FASTGPT_SOLUTIONS_PREVIEW_TARGET;
  const httpContract =
    options.solutionsHttpContract || process.env.FASTGPT_SOLUTIONS_PREVIEW_CONTRACT;
  const approvedTarget =
    options.solutionsApprovedTarget || process.env.FASTGPT_SOLUTIONS_APPROVED_PREVIEW_TARGET;
  if (httpTarget || httpContract) {
    if (!httpTarget || !httpContract) {
      record.crossProjectInputs.solutionsPreviewHttp = normalizeSolutionsEvidence({
        status: 'blocked'
      });
      record.crossProjectInputs.solutionsPreviewHttp.blockers.push({
        code: 'solutions-http-runner-input-incomplete',
        detail: 'Solutions preview target and contract must be supplied together'
      });
      return;
    }
    const contractPath = path.resolve(ROOT, httpContract);
    const outputPath = path.join(RETAIN_DIR, 'solutions-preview-http.json');
    try {
      JSON.parse(fs.readFileSync(contractPath, 'utf8'));
      record.sourceProvenance.push(
        fileProvenance(contractPath, {
          root: ROOT,
          role: 'cross-project-contract',
          source: 'external'
        })
      );
      const runnerArgs = [
        path.join(ROOT, 'scripts/verify-solutions-preview-http.js'),
        '--target',
        httpTarget,
        '--contract',
        contractPath,
        '--output',
        outputPath
      ];
      if (approvedTarget) runnerArgs.push('--approved-target', approvedTarget);
      const result = spawnSync(process.execPath, runnerArgs, {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });
      const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
      const displayRunnerArgs = runnerArgs.map((argument) =>
        argument === httpTarget || argument === approvedTarget ? redactTarget(argument) : argument
      );
      const evidence = result.stdout ? JSON.parse(result.stdout) : { status: 'blocked' };
      const provenance = fs.existsSync(outputPath)
        ? fileProvenance(outputPath, {
            root: ROOT,
            role: 'cross-project-evidence',
            source: 'generated'
          })
        : undefined;
      const responseDirectory = path.join(RETAIN_DIR, 'solutions-preview-http-responses');
      if (fs.existsSync(responseDirectory)) {
        record.artifacts.push({
          variant: 'cross-project',
          ...directoryInventory(responseDirectory, {
            root: ROOT,
            role: 'cross-project-http-responses',
            source: 'generated'
          })
        });
      }
      if (provenance) {
        record.artifacts.push({
          variant: 'cross-project',
          ...provenance,
          role: 'cross-project-evidence-file'
        });
      }
      const normalizedEvidence = normalizeSolutionsEvidence(evidence, {
        provenance,
        approvedTarget
      });
      normalizedEvidence.blockers.push(
        ...verifyResponseDirectory(normalizedEvidence.responses, responseDirectory)
      );
      if (normalizedEvidence.blockers.length) {
        normalizedEvidence.status = 'blocked';
        normalizedEvidence.claim = false;
      }
      record.crossProjectInputs.solutionsPreviewHttp = normalizedEvidence;
      if (result.status !== 0) {
        normalizedEvidence.status = 'blocked';
        normalizedEvidence.claim = false;
        record.crossProjectInputs.solutionsPreviewHttp.blockers.push({
          code: 'solutions-http-runner-failed',
          detail: output
        });
      }
      record.commands.push({
        id: 'solutions-preview.http',
        label: 'Solutions preview HTTP black-box contract',
        command: `${process.execPath} ${displayRunnerArgs.join(' ')}`,
        status: result.status === 0 ? 'passed' : 'failed',
        output: output.slice(-4000) || '<no command output>'
      });
    } catch (error) {
      record.crossProjectInputs.solutionsPreviewHttp = normalizeSolutionsEvidence(
        { status: 'blocked', target: httpTarget },
        {
          provenance: {
            path: path.relative(ROOT, contractPath),
            role: 'cross-project-contract',
            source: 'external'
          },
          approvedTarget
        }
      );
      record.crossProjectInputs.solutionsPreviewHttp.blockers.push({
        code: 'solutions-http-runner-failed',
        detail: error.message
      });
      record.commands.push({
        id: 'solutions-preview.http',
        label: 'Solutions preview HTTP black-box contract',
        command: `${
          process.execPath
        } scripts/verify-solutions-preview-http.js --target ${redactTarget(
          httpTarget
        )} --contract ${contractPath}`,
        status: 'failed',
        output: error.message
      });
    }
    return;
  }

  const configuredPath =
    options.solutionsEvidence || process.env.FASTGPT_SOLUTIONS_PREVIEW_EVIDENCE;
  if (!configuredPath) {
    record.crossProjectInputs.solutionsPreviewHttp = normalizeSolutionsEvidence();
    return;
  }

  const evidencePath = path.resolve(ROOT, configuredPath);
  let provenance;
  try {
    provenance = fileProvenance(evidencePath, {
      root: ROOT,
      role: 'cross-project-evidence',
      source: 'external'
    });
  } catch (error) {
    record.crossProjectInputs.solutionsPreviewHttp = normalizeSolutionsEvidence(
      { status: 'invalid', detail: error.message },
      { provenance: { path: evidencePath, role: 'cross-project-evidence', source: 'external' } }
    );
    record.crossProjectInputs.solutionsPreviewHttp.blockers.push({
      code: 'solutions-evidence-file-unreadable',
      detail: error.message
    });
    return;
  }

  try {
    const input = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    const normalizedEvidence = normalizeSolutionsEvidence(input, {
      provenance,
      approvedTarget
    });
    const responseDirectory = path.join(
      path.dirname(evidencePath),
      `${path.basename(evidencePath, path.extname(evidencePath))}-responses`
    );
    if (fs.existsSync(responseDirectory)) {
      record.artifacts.push({
        variant: 'cross-project',
        ...directoryInventory(responseDirectory, {
          root: ROOT,
          role: 'cross-project-http-responses',
          source: 'external'
        })
      });
    }
    normalizedEvidence.blockers.push(
      ...verifyResponseDirectory(normalizedEvidence.responses, responseDirectory)
    );
    if (normalizedEvidence.blockers.length) {
      normalizedEvidence.status = 'blocked';
      normalizedEvidence.claim = false;
    }
    try {
      persistExternalSolutionsEvidence(
        record,
        evidencePath,
        responseDirectory,
        provenance,
        normalizedEvidence
      );
    } catch (error) {
      normalizedEvidence.blockers.push({
        code: 'solutions-evidence-persist-failed',
        detail: error.message
      });
      normalizedEvidence.status = 'blocked';
      normalizedEvidence.claim = false;
    }
    record.crossProjectInputs.solutionsPreviewHttp = normalizedEvidence;
  } catch (error) {
    record.crossProjectInputs.solutionsPreviewHttp = normalizeSolutionsEvidence(
      { status: 'invalid', detail: error.message },
      { provenance, approvedTarget }
    );
    record.crossProjectInputs.solutionsPreviewHttp.blockers.push({
      code: 'solutions-evidence-json-invalid',
      detail: error.message
    });
  }
}

module.exports = {
  GENERATED_PUBLIC_PATHS,
  addRollbackFile,
  collectSourceProvenance,
  commandLabel,
  createFailure,
  loadSolutionsEvidence,
  redactReleaseOptions,
  redactTarget
};
