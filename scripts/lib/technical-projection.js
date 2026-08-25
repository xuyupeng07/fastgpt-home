#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function fold(value) {
  return String(value).normalize('NFKC').toUpperCase().toLowerCase();
}

function identityKey(identity) {
  return `${fold(identity.locale)}|${fold(identity.canonicalPath)}`;
}

function surfaceIdentitySet(surface, surfaceName) {
  if (!Array.isArray(surface)) throw new Error(`${surfaceName} must be an array`);
  return surface.map((entry, index) => {
    if (typeof entry === 'string') {
      const match = entry.match(/^https?:\/\/[^/]+(\/.*)$/);
      if (!match) throw new Error(`${surfaceName}[${index}] has no route identity`);
      return fold(match[1]);
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${surfaceName}[${index}] must be an object`);
    }
    if (entry.identity) {
      if (typeof entry.identity === 'object') return identityKey(entry.identity);
      return fold(entry.identity);
    }
    if (entry.key) return fold(entry.key);
    if (entry.path) return fold(entry.path);
    throw new Error(`${surfaceName}[${index}] has no route identity`);
  });
}

function verifyProjectionConsistency(projection) {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
    throw new Error('projection must be an object');
  }
  if (projection.consistency !== 'identity-set-verified') {
    throw new Error('Projection consistency must be identity-set-verified');
  }
  const identitySet = surfaceIdentitySet(projection.identities, 'identities');
  if (new Set(identitySet).size !== identitySet.length) {
    throw new Error('Projection identities contain duplicate entries');
  }
  const surfaces = [
    ['registry', surfaceIdentitySet(projection.registry, 'registry')],
    ['search', surfaceIdentitySet(projection.search, 'search')],
    ['sitemap', surfaceIdentitySet(projection.sitemap, 'sitemap')],
    ['staticExport', surfaceIdentitySet(projection.staticExport, 'staticExport')],
    ['releaseRecord', surfaceIdentitySet(projection.releaseRecord, 'releaseRecord')],
    ['rollback', surfaceIdentitySet(projection.rollback, 'rollback')]
  ];
  const expected = JSON.stringify(identitySet.sort());
  for (const [name, identities] of surfaces) {
    if (
      identities.length !== identitySet.length ||
      new Set(identities).size !== identities.length
    ) {
      throw new Error(`Projection identity cardinality drift in ${name}`);
    }
    if (JSON.stringify(identities.sort()) !== expected) {
      throw new Error(`Projection identity drift in ${name}`);
    }
  }
  return true;
}

function stageProjectionFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  );
  const descriptor = fs.openSync(temporaryPath, 'wx');
  let complete = false;
  try {
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
    complete = true;
  } finally {
    fs.closeSync(descriptor);
    if (!complete) fs.rmSync(temporaryPath, { force: true });
  }
  return temporaryPath;
}

function replaceProjectionFile(filePath, content) {
  const temporaryPath = stageProjectionFile(filePath, content);
  try {
    fs.renameSync(temporaryPath, filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function applyRollbackProjection({ files, contents, failAt } = {}) {
  if (!Array.isArray(files)) throw new Error('files must be an array');
  if (!Array.isArray(contents)) throw new Error('contents must be an array');
  if (files.length !== contents.length || !files.length) {
    throw new Error('Projection files and contents must have the same non-empty length');
  }
  const resolvedFiles = files.map((filePath) => path.resolve(filePath));
  if (new Set(resolvedFiles).size !== resolvedFiles.length) {
    throw new Error('Projection files must be unique');
  }

  const before = files.map((filePath) =>
    fs.existsSync(filePath) ? fs.readFileSync(filePath) : null
  );
  const staged = [];
  let commitStarted = false;
  try {
    files.forEach((filePath, index) => {
      staged.push(stageProjectionFile(filePath, contents[index]));
    });
    commitStarted = true;
    files.forEach((filePath, index) => {
      fs.renameSync(staged[index], filePath);
      if (failAt === index + 1) throw new Error(`Projection failure at surface ${index + 1}`);
    });
  } catch (error) {
    if (commitStarted) {
      const rollbackErrors = [];
      files.forEach((filePath, index) => {
        try {
          if (before[index] === null) fs.rmSync(filePath, { force: true });
          else replaceProjectionFile(filePath, before[index]);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      });
      if (rollbackErrors.length) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          'Projection write and rollback failed'
        );
      }
    }
    throw error;
  } finally {
    staged.forEach((temporaryPath) => fs.rmSync(temporaryPath, { force: true }));
  }
}

module.exports = { applyRollbackProjection, verifyProjectionConsistency };
