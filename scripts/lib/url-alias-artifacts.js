const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  AUTHORITY_RELATIVE_PATH,
  getUrlAliasAuthorityDigest,
  getUrlAliasAuthoritySummary,
  getValidatedAuthorityResult
} = require('./url-alias-authority');

const ARTIFACT_SCHEMA_VERSION = 1;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readBytes(filePath) {
  return fs.readFileSync(filePath);
}

function fileEntry(filePath, relativePath, role) {
  const bytes = readBytes(filePath);
  return {
    path: relativePath,
    role,
    bytes: bytes.length,
    sha256: sha256(bytes)
  };
}

function buildProvenance(authorityResult) {
  const authority = getValidatedAuthorityResult(authorityResult).authority;
  return (authority.sources || []).map((source) => ({
    workbook: source.workbook,
    sha256: source.sha256,
    sheet: source.sheet,
    acceptedRows: source.acceptedRows
  }));
}

function buildArtifactMetadata(authorityResult, variant, projectionFile) {
  const authority = getValidatedAuthorityResult(authorityResult);
  const summary = getUrlAliasAuthoritySummary(authority);
  const sourceHost = variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io';
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    authority: {
      path: AUTHORITY_RELATIVE_PATH,
      digest: getUrlAliasAuthorityDigest(authority),
      sourceCount: summary.sources,
      sourceHosts: summary.sourceHosts,
      targetCount: summary.targets,
      manyToOneTargets: summary.manyToOneTargets,
      reasons: summary.reasons,
      provenance: buildProvenance(authority)
    },
    projection: {
      variant,
      sourceHost,
      sourceCount: projectionFile.bytes > 0 ? projectionFile.sourceCount : 0,
      artifact: projectionFile.path,
      sha256: projectionFile.sha256
    }
  };
}

function writeArtifact(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stableJson(value));
}

function resolveArtifactPath(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(root, relativePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`URL Alias artifact path escapes its bundle: ${relativePath}`);
  }
  return resolvedPath;
}

/**
 * Copy the complete alias release unit into a deterministic release directory.
 * The rollback directory is a byte-identical restore bundle for the same authority.
 */
function writeUrlAliasArtifactBundle(rootDir, destinationDir, variant) {
  if (!['cn', 'io'].includes(variant))
    throw new Error(`Unsupported URL Alias artifact variant: ${variant}`);
  const authorityPath = path.join(rootDir, AUTHORITY_RELATIVE_PATH);
  const projectionPath =
    variant === 'cn'
      ? path.join(rootDir, '.next', 'nginx-redirects.conf')
      : path.join(rootDir, 'out', '_worker.js');
  if (!fs.existsSync(authorityPath))
    throw new Error(`Missing URL Alias Authority: ${authorityPath}`);
  if (!fs.existsSync(projectionPath))
    throw new Error(`Missing ${variant} URL Alias projection: ${projectionPath}`);

  const authorityResult = getValidatedAuthorityResult(
    require('./url-alias-authority').readUrlAliasAuthority(rootDir)
  );
  const authorityBytes = readBytes(authorityPath);
  const projectionBytes = readBytes(projectionPath);
  const projectionRelativePath = variant === 'cn' ? 'nginx-redirects.conf' : '_worker.js';
  const projectionRole = variant === 'cn' ? 'nginx' : 'worker';
  const files = [
    {
      source: authorityPath,
      relative: 'url-alias-authority.json',
      role: 'authority'
    },
    {
      source: projectionPath,
      relative: projectionRelativePath,
      role: projectionRole
    }
  ];
  const root = path.join(destinationDir, 'url-alias', variant);
  const releaseDir = path.join(root, 'release');
  const rollbackDir = path.join(root, 'rollback');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.mkdirSync(rollbackDir, { recursive: true });

  const fileEntries = files.map(({ source, relative, role }) => ({
    ...fileEntry(source, relative, role),
    source
  }));
  const projectionEntry = fileEntries.find((entry) => entry.role === projectionRole);
  const projectionMetadata = {
    path: projectionEntry.path,
    bytes: projectionEntry.bytes,
    sha256: projectionEntry.sha256,
    sourceCount: authorityResult.records.filter(
      (record) => record.sourceHost === (variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io')
    ).length
  };
  const baseMetadata = buildArtifactMetadata(authorityResult, variant, projectionMetadata);
  const releaseManifest = {
    ...baseMetadata,
    kind: 'url-alias-release',
    files: fileEntries.map(({ path: relative, role, bytes, sha256: digest }) => ({
      path: relative,
      role,
      bytes,
      sha256: digest
    }))
  };
  const rollbackManifest = {
    ...baseMetadata,
    kind: 'url-alias-rollback',
    restore: releaseManifest.files
  };

  for (const { source, relative } of files) {
    fs.copyFileSync(source, path.join(releaseDir, relative));
    fs.copyFileSync(source, path.join(rollbackDir, relative));
  }
  writeArtifact(path.join(releaseDir, 'manifest.json'), releaseManifest);
  writeArtifact(path.join(rollbackDir, 'manifest.json'), rollbackManifest);

  return {
    root,
    releaseDir,
    rollbackDir,
    releaseManifest,
    rollbackManifest,
    authoritySha256: sha256(authorityBytes),
    projectionSha256: sha256(projectionBytes)
  };
}

function verifyUrlAliasArtifactBundle(bundleRoot, variants = ['cn', 'io']) {
  const result = {};
  for (const variant of variants) {
    const variantRoot = path.join(bundleRoot, variant);
    const releaseManifestPath = path.join(variantRoot, 'release', 'manifest.json');
    const rollbackManifestPath = path.join(variantRoot, 'rollback', 'manifest.json');
    if (!fs.existsSync(releaseManifestPath) || !fs.existsSync(rollbackManifestPath)) {
      throw new Error(`URL Alias release/rollback manifests are incomplete for ${variant}`);
    }
    const release = JSON.parse(fs.readFileSync(releaseManifestPath, 'utf8'));
    const rollback = JSON.parse(fs.readFileSync(rollbackManifestPath, 'utf8'));
    if (release.kind !== 'url-alias-release' || rollback.kind !== 'url-alias-rollback') {
      throw new Error(`URL Alias artifact kinds are invalid for ${variant}`);
    }
    if (
      release.schemaVersion !== ARTIFACT_SCHEMA_VERSION ||
      rollback.schemaVersion !== ARTIFACT_SCHEMA_VERSION
    ) {
      throw new Error(`URL Alias artifact schema version is invalid for ${variant}`);
    }
    if (JSON.stringify(release.authority) !== JSON.stringify(rollback.authority)) {
      throw new Error(`URL Alias rollback authority drift for ${variant}`);
    }
    if (JSON.stringify(rollback.restore) !== JSON.stringify(release.files)) {
      throw new Error(`URL Alias rollback file manifest drift for ${variant}`);
    }
    if (!Array.isArray(release.files) || release.files.length !== 2) {
      throw new Error(`URL Alias artifact file manifest is incomplete for ${variant}`);
    }
    const authorityEntry = release.files.find((entry) => entry.role === 'authority');
    const projectionRole = variant === 'cn' ? 'nginx' : 'worker';
    const projectionEntry = release.files.find((entry) => entry.role === projectionRole);
    if (!authorityEntry || !projectionEntry) {
      throw new Error(`URL Alias artifact roles are incomplete for ${variant}`);
    }
    for (const entry of release.files) {
      const releasePath = resolveArtifactPath(path.join(variantRoot, 'release'), entry.path);
      const rollbackPath = resolveArtifactPath(path.join(variantRoot, 'rollback'), entry.path);
      const releaseBytes = readBytes(releasePath);
      const rollbackBytes = readBytes(rollbackPath);
      if (sha256(releaseBytes) !== entry.sha256 || sha256(rollbackBytes) !== entry.sha256) {
        throw new Error(`URL Alias artifact checksum drift for ${variant}/${entry.path}`);
      }
      if (!releaseBytes.equals(rollbackBytes)) {
        throw new Error(`URL Alias rollback bytes drift for ${variant}/${entry.path}`);
      }
    }
    const authorityBytes = readBytes(
      resolveArtifactPath(path.join(variantRoot, 'release'), authorityEntry.path)
    );
    const authorityResult = getValidatedAuthorityResult(
      JSON.parse(authorityBytes.toString('utf8'))
    );
    const expectedMetadata = buildArtifactMetadata(authorityResult, variant, {
      path: projectionEntry.path,
      bytes: projectionEntry.bytes,
      sha256: projectionEntry.sha256,
      sourceCount: authorityResult.records.filter(
        (record) => record.sourceHost === (variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io')
      ).length
    });
    if (JSON.stringify(release.authority) !== JSON.stringify(expectedMetadata.authority)) {
      throw new Error(`URL Alias authority metadata drift for ${variant}`);
    }
    if (JSON.stringify(release.projection) !== JSON.stringify(expectedMetadata.projection)) {
      throw new Error(`URL Alias projection metadata drift for ${variant}`);
    }
    result[variant] = { release, rollback };
  }
  return result;
}

module.exports = {
  ARTIFACT_SCHEMA_VERSION,
  buildArtifactMetadata,
  sha256,
  verifyUrlAliasArtifactBundle,
  writeUrlAliasArtifactBundle
};
