---
status: Accepted
---

# ADR 054: Restricted workspace onboarding

## Context

Read-only filtering and validation must activate in Restricted Mode. Empty windows need actionable prerequisites rather than enabled creation commands that immediately fail.

## Decision

Declare limited untrusted-workspace support. Keep runtime trust checks for writes, generated indexes, agent instructions, and Markdown preview links. Do not initialize optional files from pending-open handling while untrusted. Refresh may update the in-memory index but skips router writes.

Use native Vaults welcome contributions and existing commands. Show the workspace prerequisite and disable Create Vault without a workspace. Use native enablement for trust-sensitive commands and selected-vault-dependent actions; runtime guards still protect direct invocation. Leave the Vaults message unset so native welcome content can appear.

## Consequences

Read-only behavior works without trust. Existing command IDs and note formats are unchanged. Test actual Restricted Mode activation separately because the ordinary host runner disables Workspace Trust.
