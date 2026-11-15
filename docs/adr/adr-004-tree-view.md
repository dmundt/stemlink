---
status: Superseded
---

# ADR 004: Single tree view

Superseded by [ADR 019](adr-019-multiple-vaults.md).

## Context

Users need a simple workspace overview and references without extra UI.

## Decision

Provide one Stemlink tree with Inbox, Notes, Ref From, and Ref To sections. Reference sections follow the active note: Ref From lists outgoing links; Ref To lists incoming references. Entries navigate on selection.

## Consequences

Refresh affected sections after note changes, active-editor changes, and vault changes. Design the tree to remain responsive with 10,000 notes.
