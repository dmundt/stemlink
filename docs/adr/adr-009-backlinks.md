---
status: Accepted
---

# ADR 009: Backlinks

## Context
Users need references to a note without searching manually.

## Decision
Provide Shift+F12 references and the tree's Ref To section. On a link use its target stem; elsewhere in a permanent note use that note's stem.

## Consequences
Return navigable reference locations. Keep results accurate after changes, including unsaved edits; avoid needless full-vault scans on every interaction.
