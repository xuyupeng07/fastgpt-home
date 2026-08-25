import authorization from './authorization.json';
import type { GuideEntry } from './registry';

export const GUIDE_AUTHORIZATION_REQUIRED_SLUGS = [
  'finance-research-retrieval',
  'finance-daily-report-automation'
] as const;

export type GuideAuthorizationStatus = 'publishable' | 'release-blocked';

export interface GuideAuthorizationEvidence {
  status: string;
  reference: string;
  digest: string;
}

export interface GuideAuthorizationCase {
  id: string;
  label: string;
  evidence: GuideAuthorizationEvidence;
}

export interface GuideAuthorizationAsset {
  id: string;
  path: string;
  alt: string;
  evidence: GuideAuthorizationEvidence;
}

export interface GuideAuthorizationRecord {
  requiredCases: GuideAuthorizationCase[];
  requiredAssets: GuideAuthorizationAsset[];
}

export interface GuideAuthorizationDecision {
  slug: string;
  status: GuideAuthorizationStatus;
  eligible: boolean;
  blockers: string[];
  requiredCases: number;
  requiredAssets: number;
}

type GuideAuthorizationDecisionMap =
  | Map<string, GuideAuthorizationDecision>
  | Record<string, GuideAuthorizationDecision>;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AUTHORITY_RECORDS = authorization as unknown as {
  schemaVersion?: number;
  requiredSlugs?: string[];
  records?: Record<string, GuideAuthorizationRecord>;
};
const AUTHORITY_SHAPE_IS_VALID =
  AUTHORITY_RECORDS.schemaVersion === 1 &&
  Array.isArray(AUTHORITY_RECORDS.requiredSlugs) &&
  AUTHORITY_RECORDS.requiredSlugs.join('\u0000') ===
    GUIDE_AUTHORIZATION_REQUIRED_SLUGS.join('\u0000') &&
  Boolean(AUTHORITY_RECORDS.records);

function isRequiredSlug(slug: string): boolean {
  return GUIDE_AUTHORIZATION_REQUIRED_SLUGS.includes(
    slug as (typeof GUIDE_AUTHORIZATION_REQUIRED_SLUGS)[number]
  );
}

function addBlocker(blockers: string[], category: string, id: string, reason: string) {
  blockers.push(`${category} ${id}: ${reason}`);
}

function validateEvidence(
  evidence: Partial<GuideAuthorizationEvidence> | undefined,
  category: string,
  id: string,
  blockers: string[]
) {
  if (!evidence || typeof evidence !== 'object') {
    addBlocker(blockers, category, id, 'missing evidence record');
    return;
  }
  if (evidence.status !== 'valid') {
    addBlocker(blockers, category, id, `evidence status is ${evidence.status || 'missing'}`);
  }
  if (typeof evidence.reference !== 'string' || !evidence.reference.trim()) {
    addBlocker(blockers, category, id, 'evidence reference is missing');
  }
  if (typeof evidence.digest !== 'string' || !SHA256_PATTERN.test(evidence.digest)) {
    addBlocker(blockers, category, id, 'evidence digest must be a SHA-256 value');
  }
}

/** Evaluate the case and asset evidence required before a finance Guide is projected. */
export function evaluateGuideAuthorization(
  slug: string,
  record: Partial<GuideAuthorizationRecord> | undefined
): GuideAuthorizationDecision {
  if (!isRequiredSlug(slug)) {
    return {
      slug,
      status: 'publishable',
      eligible: true,
      blockers: [],
      requiredCases: 0,
      requiredAssets: 0
    };
  }

  const blockers: string[] = [];
  if (!record || typeof record !== 'object') {
    addBlocker(blockers, 'authorization', slug, 'record is missing');
    return {
      slug,
      status: 'release-blocked',
      eligible: false,
      blockers,
      requiredCases: 0,
      requiredAssets: 0
    };
  }

  const requiredCases = Array.isArray(record.requiredCases) ? record.requiredCases : [];
  const requiredAssets = Array.isArray(record.requiredAssets) ? record.requiredAssets : [];
  if (!requiredCases.length) addBlocker(blockers, 'case', slug, 'required case list is empty');
  if (!requiredAssets.length) addBlocker(blockers, 'asset', slug, 'required asset list is empty');

  const seenCases = new Set<string>();
  for (const item of requiredCases) {
    const id = typeof item?.id === 'string' ? item.id : 'unknown-case';
    if (!SAFE_ID_PATTERN.test(id)) addBlocker(blockers, 'case', id, 'invalid case identifier');
    if (seenCases.has(id)) addBlocker(blockers, 'case', id, 'duplicate case identifier');
    seenCases.add(id);
    if (typeof item?.label !== 'string' || !item.label.trim()) {
      addBlocker(blockers, 'case', id, 'case label is missing from authority');
    }
    validateEvidence(item?.evidence, 'case', id, blockers);
  }

  const seenAssets = new Set<string>();
  for (const item of requiredAssets) {
    const id = typeof item?.id === 'string' ? item.id : 'unknown-asset';
    if (!SAFE_ID_PATTERN.test(id)) addBlocker(blockers, 'asset', id, 'invalid asset identifier');
    if (seenAssets.has(id)) addBlocker(blockers, 'asset', id, 'duplicate asset identifier');
    seenAssets.add(id);
    if (
      typeof item?.path !== 'string' ||
      !item.path.startsWith('/') ||
      item.path.includes('..') ||
      typeof item.alt !== 'string' ||
      !item.alt.trim()
    ) {
      addBlocker(blockers, 'asset', id, 'asset path or alt text is missing');
    }
    validateEvidence(item?.evidence, 'asset', id, blockers);
  }

  return {
    slug,
    status: blockers.length ? 'release-blocked' : 'publishable',
    eligible: blockers.length === 0,
    blockers,
    requiredCases: requiredCases.length,
    requiredAssets: requiredAssets.length
  };
}

function decisionFor(
  decisions: GuideAuthorizationDecisionMap,
  slug: string
): GuideAuthorizationDecision | undefined {
  return decisions instanceof Map ? decisions.get(slug) : decisions[slug];
}

/** Filter the public Guide registry using an explicit authorization decision map. */
export function projectGuideEntries(
  entries: GuideEntry[],
  decisions: GuideAuthorizationDecisionMap = guideAuthorizationDecisions
): GuideEntry[] {
  return entries.filter(
    (entry) => !isRequiredSlug(entry.slug) || decisionFor(decisions, entry.slug)?.eligible === true
  );
}

export const guideAuthorizationDecisions: Record<string, GuideAuthorizationDecision> =
  Object.fromEntries(
    GUIDE_AUTHORIZATION_REQUIRED_SLUGS.map((slug) => [
      slug,
      evaluateGuideAuthorization(
        slug,
        AUTHORITY_SHAPE_IS_VALID ? AUTHORITY_RECORDS.records?.[slug] : undefined
      )
    ])
  );

export function getGuideAuthorizationDecision(slug: string): GuideAuthorizationDecision {
  return guideAuthorizationDecisions[slug] || evaluateGuideAuthorization(slug, undefined);
}
