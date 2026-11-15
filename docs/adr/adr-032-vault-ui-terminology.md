---
status: Accepted; view-heading rule superseded by ADR 040
---

# ADR 032: Vault UI terminology

[ADR 040](adr-040-configured-view-headings.md) replaces fixed capture and permanent-note view headings with the selected vault's folder names. Command terminology remains unchanged.

## Context

Actions, dialogs, and status messages use inconsistent names for the same Stemlink vault. Inconsistent labels make commands harder to recognize.

## Decision

Use “Vault” for collection actions and “Notes” for permanent notes in the extension UI. Name the creation command **Create Vault**, matching **Open Vault**, and use vault terminology in prompts, settings descriptions, selection actions, errors, and notifications.

Keep the `stemlink.createVault` command identifier and existing settings and marker keys unchanged. Use “Stemlink vault” for the collection in UI and descriptive text.

## Consequences

Command palette users see consistent labels without losing existing keybindings or command integrations. Documentation refers to the current command names.
