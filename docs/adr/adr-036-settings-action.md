---
status: Accepted
---

# ADR 036: Settings action

## Context

Users need a direct way to find Stemlink settings from its sidebar.

## Decision

Add a gear action to the Vaults view title and a corresponding command palette action. Open the native VS Code Settings editor filtered to the Stemlink extension.

## Consequences

Settings remain managed by VS Code, including their existing scopes and Settings Sync behavior. The action does not require a selected vault or workspace trust.
