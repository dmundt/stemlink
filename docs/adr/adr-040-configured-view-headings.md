---
status: Accepted
---

# ADR 040: Configured view headings

## Context

Fixed Fleeting and Notes headings can differ from a vault's configured capture and permanent-note folder names.

## Decision

Use the final folder names from the selected vault's resolved inbox and notes paths as view headings, preserving case. Update headings when selection or resolved paths change. Retain the configured count-display behavior, generic Fleeting and Notes headings when no vault is selected, and fixed Vaults and References headings.

Keep view IDs, tree-item IDs and kinds, commands, and settings unchanged. This supersedes only the fixed view-heading terminology in ADR 032.

## Consequences

Headings correspond to the folders readers see in their workspace. Multiple vaults use the currently selected vault's names; other vaults do not rename these views. Existing selection and expansion state remain compatible.
