---
status: Accepted
---

# ADR 027: Templates folder mapping

## Context

Vault markers map capture and permanent-note folders, but the templates location is fixed. Users need a portable mapping for editable examples as well.

## Decision

Add optional `templates` to version 1 `.stemlink.json`. New markers write `"templates": "templates"`. Missing values in older markers resolve to `templates` without rewriting the marker. Explicit values must be valid single child-folder names distinct from inbox and notes, ignoring case.

Use the resolved path for template creation and Add Fleeting Note, retaining the configured notes folder as its legacy fallback only when the preferred file is missing. Include the templates mapping in generated manuals, routers, and agent instructions. Opening a vault does not install or move templates.

VS Code path settings do not configure templates. Preserve the marker's templates mapping with either choice when resolving settings conflicts. Settings-only vaults retain the default templates folder.

This supersedes only the fixed templates location in [ADR 026](adr-026-vault-template-folder.md) and extends the marker contract in [ADR 021](adr-021-vault-configuration-marker.md).

## Consequences

Existing version 1 vaults require no migration. Existing content remains unchanged; users moving templates must move the files and update the marker. Older extension versions ignore the new mapping and continue their fixed-path lookup, so custom template locations require a version supporting this field.
