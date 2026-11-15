---
status: Accepted
---

# ADR 034: Quality and publication alignment

## Context

Stemlink and Prompteur use similar cross-platform quality and release workflows. Stemlink should also check lint, formatting, and all dependency audit severities while retaining its supported VS Code version and host benchmark.

## Decision

Run `npm audit`, ESLint, Prettier, coverage, and build in the existing six-job Node.js 22 matrix. Retain the VS Code 1.90.0 and stable versions and the Linux stable 10,000-note benchmark. ESLint and Prettier are development-only dependencies. Patched minimatch overrides for packaging and TypeScript lint tooling address their vulnerable transitive versions.

After release tag validation and the quality workflow, upload the release asset and publish the same verified VSIX independently, matching Prompteur. Either job may succeed if the other fails; operators must inspect both results.

This supersedes the quality-check and release-ordering details in [ADR 017](adr-017-build-and-publication.md).

## Consequences

Formatting is checked across supported repository files. A clean dependency audit is required for CI. Marketplace publication no longer waits for the release-asset upload to succeed.
