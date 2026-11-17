---
status: Accepted
---

# ADR 070: Repository delivery

## Context

Stemlink and Prompteur share a lean GitHub Flow. The former six-job PR matrix
and release-published trigger conflict with that workflow. Marketplace does
not accept SemVer prerelease suffixes.

## Decision

This supersedes the delivery, validation placement, and release ordering in
[ADR 017](adr-017-build-and-publication.md) and
[ADR 034](adr-034-quality-and-publication-alignment.md).

Use short-lived branches and protected-main pull requests. Non-main pushes
install and build; PRs run lint, typecheck, unit tests, and host tests through
the required `PR validation` check. Nightly/manual validation runs audit,
formatting, coverage, and the host benchmark. Native coverage floors are
95% lines, 87% branches, and 93% functions.

A separate manual compatibility workflow runs Windows, macOS, and Linux
against minimum supported and stable VS Code, including Restricted Mode.
Expensive compatibility checks do not run on every push or PR.

Releases require an explicitly pushed `v<version>` tag on a commit contained
in published `main`. Validate numeric `major.minor.patch`, tag equality, both
lockfile versions, and boolean `package.json` setting `vsce.preRelease`.
The same setting selects Marketplace's prerelease flag and GitHub Release
state. Numeric versions must differ between stable and prerelease releases.
Local `npm run package` reads that setting too.

Build and package once for distribution, upload the VSIX artifact, create or
update the GitHub Release, then publish that artifact with Marketplace OIDC.
GitHub Release failure prevents Marketplace publication; Marketplace failure
can leave a GitHub Release available. Inspect both results and rerun the
failed workflow for transient errors. Fix source/configuration failures
through a new version/tag; protected release tags are never moved. No
publication occurs on ordinary merges or manual compatibility checks.

## Consequences

Repository settings must be migrated to the successful replacement check
before merging the workflow replacement, without disabling PR protection or
adding bypass actors. Private vulnerability reporting is enabled separately.
Packaged README links use repository metadata and VSCE rewriting.

Build systems, runtime dependencies, VS Code minimums, and product test
frameworks remain repository-specific. Local checks do not certify OIDC,
all platforms, or future GitHub-hosted executions.
