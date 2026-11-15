---
status: Accepted
---

# ADR 033: Configurable count display

## Context

Sidebar view and reference-group counts help users understand a vault but add visual noise for users who do not need them.

## Decision

Add resource-scoped `stemlink.showCounts`, defaulting to `true`. When disabled, omit counts and pending-count placeholders from Vaults, Fleeting, Notes, References, Inbound, and Outbound labels. Continue showing error states. Apply the selected vault's setting to all labels; when no vault is selected, use the unscoped setting. Changes refresh the views without reloading.

This setting changes presentation only. It does not change indexing, reference results, diagnostic findings, router files, or vault contents.

This supersedes the fixed-count presentation in [ADR 023](adr-023-separated-tree-views.md) and the restriction on count settings in [ADR 025](adr-025-configurable-feature-settings.md).

## Consequences

Existing users retain counts by default. Multi-root workspaces can use different values for different selected vaults. Error indicators remain visible even when counts are hidden.
