---
status: Accepted
---

# ADR 039: Expanded reference groups

## Context

Readers should see inbound and outbound references without first expanding their groups.

## Decision

Use `TreeItemCollapsibleState.Expanded` as the default for Inbound and Outbound. Keep stable tree-item IDs and leave other tree items unchanged.

## Consequences

VS Code can retain a user's later expansion or collapse choice. This changes the initial default, not a user's saved tree state, and does not force groups open on refresh.
