---
status: Accepted
---

# ADR 055: Tree recovery states

## Context

Cached count failures need a reliable retry. Empty lists and an editor outside the selected vault must not imply a successful zero-reference lookup.

## Decision

Refresh rediscovers vaults, preserves available selection, resets selected-vault listing failures, and refreshes the selected in-memory index. With no vault it still completes discovery. Router writes remain trusted-only.

Use native view messages for empty captures/notes, zero tag matches, load failures, and reference scope. References has no groups or numeric count when no eligible note is active in the selected vault. Explain another vault's active note without changing selection. Keep native loading behavior and existing commands; add no placeholder file rows.

## Consequences

This extends ADR 031 without changing fixed selection. Cache retries and view messages share existing index/tree events. Note formats, navigation targets, configured headings, and tag matching are unchanged.
