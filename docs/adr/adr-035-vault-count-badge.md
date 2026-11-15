---
status: Accepted
---

# ADR 035: Vault count badge

## Context

Users need to see how many vaults are available without opening the Stemlink sidebar.

## Decision

Set the native Vaults tree view badge to the number of discovered vaults across the current workspace. Clear the badge when no vault is available. Update it when discovery adds or removes vaults, including across workspace folders.

The badge remains visible when `stemlink.showCounts` hides sidebar counts. It counts discovered vaults, not notes or workspace folders.

## Consequences

VS Code renders the Activity Bar badge using its native view badge API. No custom icon or persisted count is needed.
