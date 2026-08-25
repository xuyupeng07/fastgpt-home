---
status: accepted
---

# ADR 0012: Separate historical URL aliases from FAQ content identity

## Decision

The repository keeps one versioned URL Alias Authority at
`src/config/url-alias-authority.json`. Each accepted record maps one host-aware historical
identity to one terminal identity:

```text
sourceHost + sourcePath -> targetHost + targetPath
```

The authority records redirect identity. The FAQ route registry continues to own content identity,
canonical slugs, locale ownership, page bodies, and terminal-page verification.

## Record contract

Every accepted record contains `sourceHost`, `sourcePath`, `targetHost`, `targetPath`,
`evidenceSource`, `workbookSha256`, `workbookSheet`, `worksheetRow`, `businessNumber`, `reason`,
and `disposition`.
The accepted snapshot records the 1,251 International sources and 37 China sources from the
Week05 URL corrections. The authority digest and source count are embedded in generated edge
artifacts for release evidence.

Hosts are exactly `fastgpt.cn` and `fastgpt.io`. Paths are absolute, ASCII URL paths with valid
percent escapes. Query strings and fragments are excluded from authority identity.

## Validation invariants

- One `(sourceHost, sourcePath)` has one target.
- Many sources may converge on one target.
- Self redirects, chains, and cycles fail validation with the source and target identity.
- Accepted targets belong to the published FAQ registry for the target host and resolve directly to
  a terminal HTTP 200 page.
- Authority records and every edge projection use bytewise source identity ordering, so repeated
  generation produces identical JSON, Nginx, and Worker bytes across locales.
- Source host partitions determine edge ownership: China sources enter the CN Nginx projection and
  International sources enter the International Worker projection.
- Uppercase historical paths use exact case-sensitive Nginx expressions. Lowercase canonical paths
  remain page requests and retain their HTTP 200 behavior.
- The edge projection emits the recorded path and its one trailing-slash request variant. Both
  variants resolve to the same target.

## Runtime projections

`buildRedirects()` loads the authority once and derives both projections from it. CN builds emit a
generated Nginx map. International builds emit a generated Cloudflare Worker map. Neither runtime
contains a hand-maintained alias copy. Both runtimes return permanent 301 redirects and append the
incoming query string to the target unchanged.

Fragments belong to browser navigation and are never sent in an HTTP request. They therefore never
enter the authority or `Location` header; the browser retains the fragment while following the
redirect.

## Ownership, release, and rollback

SEO/content owners approve source-to-target evidence and terminal content identity. Website
engineering owns normalization, validation, deterministic projection, and release checks. Edge
owners deploy the generated Nginx and Worker artifacts. The release coordinator runs source
authority checks, deterministic-generation checks, and representative real-runtime HTTP checks
alongside the existing FAQ, SEO, type, lint, and static-export gates.

The authority JSON, digest, Nginx map, Worker map, and verification record form one release unit.
Rollback restores the previous release unit together, including both edge projections and the
authority digest. A changed mapping receives a new commit and release verification record.
