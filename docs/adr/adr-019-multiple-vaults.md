---
status: Superseded in part by ADRs 023 and 031
---

# ADR 019: Multiple vaults

[ADR 031](adr-031-native-vault-selection.md) replaces the initial manual multi-vault selection rule with last-available or first-listed automatic selection and native row highlighting.

## Context

A workspace can contain several Stemlink vaults. Choosing only one during discovery prevents users from switching between them in the tree. Users also need reference counts without blocking note navigation on a cold content scan.

## Decision

Discover all vault markers in each workspace root and its immediate children, retaining compatible settings-only vaults. Report invalid markers without hiding other vaults. If a marker and explicit settings disagree about folders in the same root, ask which configuration to use. The marker format and discovery depth from ADR 018 remain unchanged.

Show one tree with Vaults, Fleeting, Notes, and References. Select vaults explicitly in Vaults; remember the selection in workspace state. Select a sole vault automatically. Fleeting and Notes belong to the selected vault. References contains Inbound and Outbound for the active note only when it belongs to that vault. Counts represent link occurrences; the total is inbound plus outbound. Other note navigation resolves against the note's own vault without changing the selection.

The one-tree presentation was superseded by [ADR 023](adr-023-separated-tree-views.md), and initial selection was superseded by [ADR 031](adr-031-native-vault-selection.md). Discovery and count behavior in this ADR remains in effect.

Start the selected vault's content and backlink index in the background. Show `...` for inbound and total counts until the index is complete, and show errors if indexing fails. Filename lookup and outgoing references remain independent of that scan. Backlink requests wait for a complete index.

## Consequences

When several vaults are discovered and none was selected previously, users select one in the tree. Selecting another vault starts its index if needed; previously indexed vaults retain their in-memory indexes. A cold scan can still take time, and edits during a scan can cause it to restart. No index is persisted and no hard note-count limit is imposed.
