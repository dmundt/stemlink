---
status: Accepted
---

# ADR 002: Configurable vault creation

## Context
Users need an inbox and notes directory with a short, neutral default while retaining control over folder names.

## Decision
Offer Create Zettelkasten, prompting for root, inbox, and notes names on every new-vault creation. Defaults are `zk`, `inbox`, and `notes`; alternatives such as `Zettelkasten/Fleeting/Permanent` and `vault/Inbox/Knowledge` are configurable folder labels. Folder names do not replace timestamped permanent-note filenames. Copy the bundled manual template to `README.md` in the vault root, preserving an existing README. Store chosen paths in workspace settings. Create this workspace's initial vault with those defaults.

## Consequences
Validate folder names and paths, detect collisions, report errors, and never overwrite existing content or settings without explicit confirmation. Custom names must work for all features.
