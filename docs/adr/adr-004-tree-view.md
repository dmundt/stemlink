---
status: Accepted
---

# ADR 004: Single tree view

## Context
Users need a simple workspace overview and references without extra UI.

## Decision
Provide one Stemlink tree with Inbox, Notes, Ref From, and Ref To sections. Reference sections follow the active note: Ref From lists outgoing links; Ref To lists incoming references. Entries navigate on selection.

## Consequences
Refresh affected sections after note changes, active-editor changes, and vault changes. Design the tree to remain responsive with 10,000 notes.
