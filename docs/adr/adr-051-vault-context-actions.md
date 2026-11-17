---
status: Superseded in part by ADR 069
---

# ADR 051: Vault context actions

## Context

Creating a permanent note or checking references currently requires selecting a vault first. Vault-row actions should use the clicked vault without changing selection or duplicating existing behavior.

## Decision

Add exactly two text-only context actions on Vaults vault rows: **New permanent note** and **Validate vault**. Use a vault-specific context value. Hide their dedicated commands from the Command Palette; add no toolbar actions, shortcuts, settings, or icons.

Resolve the item's registered vault explicitly. Reject missing, wrong-kind, or stale rows rather than falling back to the selected vault or active editor. Keep the selected vault unchanged.

Share permanent-note creation with Add Note: title and optional tags, existing YAML and timestamp-slug generation, collision-safe saving, index recording, view refresh, and document opening. Require Workspace Trust for both entry points. Recheck trust, registration, and the destination after prompts before creating the file. Existing enabled router watchers continue to update generated indexes.

Share validation with Check References. Refresh the requested vault's in-memory index and audit its permanent notes, including unsaved open documents, with existing exclusions, findings, and completion counts. Replace prior Stemlink Problems results globally on each run, as specified by ADR 011. This is not a new structural validator, repair action, or router refresh; validation does not write workspace files or require Workspace Trust.

## Consequences

Existing selected-vault commands remain available and use the same helpers. Creation now explicitly enforces Workspace Trust through either entry point. Validation of one vault removes previous results for another vault. No file format, metadata, or migration changes are required.
