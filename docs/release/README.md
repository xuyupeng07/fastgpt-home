# Week05 release-readiness evidence

`npm run verify:release -- --keep-artifacts` writes the auditable record to
`.release-artifacts/release-verification.json`. The record includes source provenance,
static-export inventories, checksums, timestamps, evidence-tier states, and the bounded
rollback inventory.

Solutions preview HTTP evidence is a cross-project input. The owner repository can run the
stdlib HTTP runner against an approved target with a contract containing `requests` named
`root`, `routes`, `robots`, `sitemap`, `canonical`, `internal-links`, and `projections`:

- `root` uses `/`; `robots` uses `/robots.txt`; `sitemap` uses `/sitemap.xml`.
- Every required request has a body assertion, and `canonical` has an exact canonical URL assertion.
- Required request paths are distinct except for an optional canonical probe.
- `projections` declares `X-Robots-Tag: noindex, nofollow` and `Content-Type: text/plain`.
- Each response records its expected HTTP status and one unique body artifact.

```bash
npm run verify:solutions-preview -- \
  --target https://approved-preview.example \
  --approved-target https://approved-preview.example \
  --contract path/to/solutions-preview-contract.json \
  --output path/to/solutions-preview-http.json
```

The contract includes the owner repository, a 7-64 character commit SHA, and
`approvedTarget: true`. The separate `--approved-target` value is the trusted target input
for the release gate. The runner identifies itself with its producer/version marker,
persists response bodies under the output sibling directory, and records response headers,
byte counts, per-response artifacts, and SHA-256 values. Attach the resulting JSON and its
`<output-basename>-responses` directory to the coordinator with:

```bash
npm run verify:release -- --keep-artifacts \
  --solutions-approved-target https://approved-preview.example \
  --solutions-evidence path/to/solutions-preview-http.json
```

The coordinator records `not-provided` and a release blocker when this input is absent. It
keeps `source-verified`, `export-verified`, `preview-http`, `release-eligible`,
`production-observed`, and `search-observed` as separate evidence tiers. The persistent
record embeds the [issue #247](https://github.com/labring/fastgpt-home/issues/247) URL and
lives at `.release-artifacts/release-verification.json`.

Pull-request CI adds `--allow-missing-solutions-evidence` so source and export verification
can complete with a release-ineligible record. Manual release runs remain strict and require
approved Solutions evidence.
