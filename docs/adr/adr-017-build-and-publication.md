---
status: Superseded by ADR 070 for delivery policy
---

# ADR 017: Build and publication

[ADR 070](adr-070-repository-delivery.md) supersedes delivery policy, validation placement, and release ordering. The following decision is historical.

## Context

Stemlink needs repeatable cross-platform checks and a Marketplace release process consistent with Prompteur, without bundling or changing runtime dependencies.

## Decision

Use Node.js 22, `npm ci`, TypeScript compilation, dependency audits, and the existing coverage tests on Windows, macOS, and Linux against VS Code 1.90.0 and stable. Run Linux host tests under Xvfb and run the 10,000-note integration benchmark on Linux stable. The `@vscode/vsce` development dependency creates a VSIX including the compiled extension, runtime dependencies, templates, and icons.

Publishing a GitHub release checks its tag against `package.json`, reruns the quality workflow, attaches its verified VSIX, and publishes that same VSIX to the VS Code Marketplace using OIDC. Prereleases use the VSIX prerelease flag. No personal access token is stored in the repository.

Before enabling releases, create or configure the real GitHub repository, configure publisher `dmundt` and its Marketplace trusted publisher for that repository and publish workflow, and grant the workflow the required OIDC and release permissions. Follow Marketplace prerelease version requirements. Repository metadata can be added once the repository URL is known; until then packaging permits its absence.

## Consequences

Quality checks download VS Code when a test version is specified. The release and Marketplace settings must be configured outside this repository. A successful local VSIX build does not verify Marketplace authentication or GitHub-hosted runners.
