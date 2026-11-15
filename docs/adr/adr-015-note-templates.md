---
status: Superseded in part by ADR 026
---

# ADR 015: Note templates

## Context

Users need simple examples for permanent notes, fleeting captures, and rewriting captures into notes.

## Decision

Bundle three Markdown templates and copy them to the configured notes folder when creating a Zettelkasten. Preserve and report existing files. Users copy and rename a template before editing it; fleeting copies belong in the inbox.

The notes-folder destination is superseded by [ADR 026](adr-026-vault-template-folder.md). The bundle, template purpose, and legacy audit behavior remain relevant.

Check References excludes underscore-prefixed Markdown files in the notes folder from the audit, including from incoming-reference counts. Other invalid filenames are still reported. This exclusion does not change the Notes tree, navigation, or backlinks.

## Consequences

Templates do not generate audit findings. Their outgoing links may still appear in backlinks, and their names are not valid wiki-link targets. Templates are examples, not enforced writing rules.
