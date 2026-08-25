#!/usr/bin/env node

/** Verify the cumulative Week05 technical authority and its controlled tracer seam. */

const path = require('node:path');
const {
  loadTechnicalAuthority,
  loadTracer,
  projectAuthority,
  projectTracer,
  validateTechnicalAuthority,
  verifyProjectionConsistency,
  verifyPersistedArtifacts
} = require('./lib/technical-authority');

const ROOT = path.resolve(__dirname, '..');

function countSecurityFindings(candidates) {
  return candidates.reduce((count, candidate) => count + candidate.security.findings.length, 0);
}

function countRiskLevels(candidates) {
  return candidates.reduce(
    (levels, candidate) => ({
      ...levels,
      [candidate.operationRisk.level]: levels[candidate.operationRisk.level] + 1
    }),
    { none: 0, D0: 0, D1: 0, D2: 0 }
  );
}

function countOperationFindings(candidates) {
  return candidates.reduce(
    (count, candidate) => count + candidate.operationRisk.findings.length,
    0
  );
}

function countUnresolvedCredentials(candidates) {
  return candidates.filter(
    (candidate) =>
      candidate.security.status === 'needs-review' && candidate.decision?.disposition !== 'denied'
  ).length;
}

function countUnresolvedOperationRisk(candidates) {
  return candidates.filter(
    (candidate) =>
      candidate.operationRisk.level !== 'none' && candidate.decision?.disposition !== 'denied'
  ).length;
}

function verifyTechnicalAuthority(repoRoot = ROOT) {
  const authority = loadTechnicalAuthority(repoRoot);
  const result = validateTechnicalAuthority(authority, {
    repoRoot,
    verifyHistory: true,
    verifyArtifacts: true
  });
  const tracer = loadTracer(repoRoot);
  const projection = projectTracer(authority, tracer);
  verifyProjectionConsistency(projection);
  const fullProjection = projectAuthority(authority);
  const repeatProjection = projectAuthority(authority);
  if (JSON.stringify(fullProjection) !== JSON.stringify(repeatProjection)) {
    throw new Error('Week05 full dry-run projection is non-deterministic');
  }
  const persisted = verifyPersistedArtifacts(authority, repoRoot);
  if (JSON.stringify(fullProjection) !== JSON.stringify(persisted.projection)) {
    throw new Error('Week05 persisted projection does not match the authority');
  }

  const observed = {
    historicalAccepted: result.history.accepted,
    historicalDenied: result.history.denied,
    historicalAdd: result.history.add,
    historicalUpdate: result.history.update,
    historicalPageCount: result.history.pageCount,
    candidateCount: result.candidates,
    accepted: result.accepted,
    denied: result.denied,
    add: result.count.add,
    update: result.count.update,
    needsEvidence: result.needsEvidence,
    deferred: result.deferred,
    temporary: result.temporary,
    closureBlocked: result.temporary > 0,
    resultingPageCount: result.count.resultingPageCount,
    governanceStatus: authority.governance.status,
    publicationCount: authority.governance.publicationCount,
    identityConflicts: authority.identityConflicts.length,
    duplicateRelations: authority.relations.length,
    resolvedRelations: authority.relations.filter(
      (relation) => relation.resolution !== 'pending-review'
    ).length,
    credentialFindings: countSecurityFindings(authority.candidates),
    credentialUnresolved: countUnresolvedCredentials(authority.candidates),
    operationFindings: countOperationFindings(authority.candidates),
    operationRiskUnresolved: countUnresolvedOperationRisk(authority.candidates),
    riskLevels: countRiskLevels(authority.candidates),
    tracerCandidateId: tracer.candidateId,
    projectionIdentityCount: projection.identities.length,
    projectionSurfaceCount: 6,
    fullProjectionIdentityCount: fullProjection.identities.length,
    fullProjectionSurfaceCount: 6,
    fullProjectionSha256: require('node:crypto')
      .createHash('sha256')
      .update(JSON.stringify(fullProjection))
      .digest('hex')
  };

  console.log(
    `[verify-technical-authority] historical baseline passed: accepted=${observed.historicalAccepted} denied=${observed.historicalDenied} add=${observed.historicalAdd} update=${observed.historicalUpdate} pages=${observed.historicalPageCount}`
  );
  console.log(
    `[verify-technical-authority] authority passed: candidates=${observed.candidateCount} accepted=${observed.accepted} denied=${observed.denied} needsEvidence=${observed.needsEvidence} deferred=${observed.deferred}`
  );
  console.log(
    `[verify-technical-authority] count invariant passed: accepted=${observed.accepted} denied=${observed.denied} add=${observed.add} update=${observed.update} resultingPages=${observed.resultingPageCount}`
  );
  console.log(
    `[verify-technical-authority] closure guard passed: temporary=${observed.temporary} closureBlocked=${observed.closureBlocked}`
  );
  console.log(
    `[verify-technical-authority] identity checks passed: conflicts=${observed.identityConflicts}`
  );
  console.log(
    `[verify-technical-authority] duplicate checks passed: relations=${observed.duplicateRelations} resolved=${observed.resolvedRelations}`
  );
  console.log(
    `[verify-technical-authority] security checks passed: credentialFindings=${observed.credentialFindings} unresolved=${observed.credentialUnresolved} denied-review=${authority.governance.deniedCredentialCount}`
  );
  console.log(
    `[verify-technical-authority] operation-risk checks passed: findings=${
      observed.operationFindings
    } unresolved=${observed.operationRiskUnresolved} risks=${JSON.stringify(observed.riskLevels)}`
  );
  console.log(
    `[verify-technical-authority] deterministic dry-run projections passed: candidate=${observed.tracerCandidateId} fullIdentities=${observed.fullProjectionIdentityCount} surfaces=${observed.fullProjectionSurfaceCount} publication-count=${observed.publicationCount} rollbackOnError=verified sha256=${observed.fullProjectionSha256}`
  );
  console.log(
    `[verify-technical-authority] governance-complete: status=${observed.governanceStatus} publication-count=${observed.publicationCount}`
  );
  console.log(`TECHNICAL_AUTHORITY_RESULT=${JSON.stringify(observed)}`);
  return { authority, projection, observed };
}

if (require.main === module) {
  try {
    verifyTechnicalAuthority();
  } catch (error) {
    console.error(`[verify-technical-authority] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyTechnicalAuthority };
