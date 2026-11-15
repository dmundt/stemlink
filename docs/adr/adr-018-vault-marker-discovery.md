---
status: Superseded
---

# ADR 018: Vault marker discovery

Superseded by [ADR 019](adr-019-multiple-vaults.md) for multi-vault selection. The marker format and discovery depth remain unchanged.

See [ADR 021](adr-021-vault-configuration-marker.md) for the marker's usage, rationale, and configuration contract.

## Context

VS Code settings alone do not identify a vault when its folder is moved or opened in another workspace. ADR 002 retains workspace settings for existing vaults and creation.

## Decision

Create `.stemlink.json` in each new vault root. The JSON object contains `version: 1` and distinct `inbox` and `notes` folder names relative to that root. Preserve an existing marker; reject reuse if it specifies different folders.

Discover markers on startup in each workspace folder and its immediate child directories, without recursive scanning. Use the marker's paths when it is the only choice. If multiple markers exist, or an explicitly configured VS Code path differs, ask the user to select a vault. Remember the choice in workspace state while the choices remain unchanged. Cancellation leaves no vault selected; Refresh retries selection.

Continue using existing VS Code settings when no marker is found. React to marker creation, changes, and deletion. Report invalid or unreadable markers rather than silently ignoring them.

## Consequences

Vault configuration travels with the vault and can be edited without VS Code. Only one vault per workspace folder is active at a time. Nested vaults beyond direct children are not discovered; open their parent or the vault itself as a workspace folder.
