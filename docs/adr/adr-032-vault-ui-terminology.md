---
status: Accepted
---

# ADR 032: Vault UI terminology

## Context

Actions, dialogs, and status messages use both “vault” and “Zettelkasten” for the same collection. Inconsistent labels make commands harder to recognize.

## Decision

Use “Vault” for collection actions and “Notes” for permanent notes in the extension UI. Name the creation command **Create Vault**, matching **Open Vault**, and use vault terminology in prompts, settings descriptions, selection actions, errors, and notifications.

Keep the `stemlink.createVault` command identifier and existing settings and marker keys unchanged. “Zettelkasten” remains appropriate for the note-taking method, descriptive documentation, and user-chosen folder names.

## Consequences

Command palette users see consistent labels without losing existing keybindings or command integrations. Documentation refers to the current command names.
