---
status: Accepted
---

# ADR 016: Fleeting note command

## Context

Captures should be quick to create and use the vault's customizable fleeting template.

## Decision

Provide Add Fleeting Note in the command palette and on the Inbox tree item. Copy the saved `_fleeting.md` from the configured notes folder into a new timestamp-named Markdown file in the configured inbox, then open it. Use a numeric suffix if needed to avoid overwriting an existing file.

## Consequences

The command requires the vault's fleeting template and reports an error if it is missing. Editing the saved template changes future captures without changing existing ones.
