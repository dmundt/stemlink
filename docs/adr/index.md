# Architecture decision index

Start here to find decisions relevant to a change. Read the linked ADRs for context, decisions, consequences, and current status; proposed decisions are not implemented requirements.

## Extension and vault

- [001: Minimal extension](adr-001-minimal-extension.md) — scope and design constraints.
- [002: Configurable vault creation](adr-002-vault-creation.md) — folder prompts, settings, and manual.
- [003: Plain Markdown notes](adr-003-note-format.md) — filenames, YAML front matter, and links.
- [004: Single tree view](adr-004-tree-view.md) — superseded tree layout.
- [018: Vault marker discovery](adr-018-vault-marker-discovery.md) — marker format; selection superseded.
- [019: Multiple vaults](adr-019-multiple-vaults.md) — vault selection, counts, and background indexing.
- [020: Open an existing vault](adr-020-open-existing-vault.md) — folder picker, confirmed marker creation, and workspace integration.
- [021: Vault-local .stemlink.json](adr-021-vault-configuration-marker.md) — usage, format, rationale, alternatives, and compatibility.

## Creating and processing notes

- [005: Add Note](adr-005-add-note.md) — permanent-note creation.
- [006: Promote Capture](adr-006-promote-capture.md) — moving captures into permanent notes.
- [015: Note templates](adr-015-note-templates.md) — bundled examples and audit exclusion.
- [016: Fleeting note command](adr-016-fleeting-note-command.md) — creating captures from the vault template.

## Links and references

- [007: Clickable document links](adr-007-document-links.md) — navigating wiki links.
- [008: Go to Definition](adr-008-definition.md) — resolving references.
- [009: Backlinks](adr-009-backlinks.md) — incoming references.
- [010: Link completion](adr-010-completion.md) — completing filename stems.
- [011: Manual reference audit](adr-011-manual-audit.md) — checking notes and links.
- [012: Rename protection](adr-012-rename-protection.md) — warnings and rename limitations.

## Performance and indexing

- [013: Performance at 10,000 notes](adr-013-performance.md) — benchmark and capacity decisions.
- [014: Initial lazy indexing](adr-014-initial-lazy-indexing.md) — superseded background indexing proposal.

## Distribution

- [017: Build and publication](adr-017-build-and-publication.md) — quality matrix, VSIX, release, and Marketplace OIDC.

## Maintenance rules

- Add an ADR for each feature decision, using the next available `adr-NNN-short-name.md` filename.
- Start each ADR with YAML front matter containing `status`; include context, decision, and consequences.
- Link each ADR here under the relevant topic. Update this index when adding, renaming, or superseding an ADR.
- Keep each ADR's status authoritative; update it when its decision changes. Link superseding decisions from the older ADR.
