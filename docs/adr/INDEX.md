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
- [022: AI routing indexes](adr-022-ai-routing-indexes.md) — superseded count-only router design.
- [023: Separate native tree views](adr-023-separated-tree-views.md) — native view separators and section-specific commands.
- [024: Opt-in vault agent instructions](adr-024-vault-agent-instructions.md) — scope-specific `AGENTS.md` files, consent, and preservation.
- [025: Configurable feature settings](adr-025-configurable-feature-settings.md) — resource-scoped router and agent-instruction settings with behavior-preserving defaults.
- [026: Vault template folder](adr-026-vault-template-folder.md) — create editable examples in `templates/` and preserve legacy fleeting-template lookup.
- [027: Templates folder mapping](adr-027-templates-folder-mapping.md) — optional portable template location and version 1 compatibility.
- [029: Default vault layout](adr-029-default-vault-layout.md) — `notes/` containing `templates/`, `inbox/`, and `permanent/`; existing vault compatibility and configurable alternatives.
- [030: Configurable folder settings](adr-030-configurable-folder-settings.md) — all four folder settings, configured creation defaults, and template mapping conflict resolution.
- [031: Native vault selection](adr-031-native-vault-selection.md) — persistent row selection without checkmarks or Selected text, restoring the last available vault or selecting the first.
- [032: Vault UI terminology](adr-032-vault-ui-terminology.md) — consistent Vault and Notes labels without changing command identifiers.
- [033: Configurable count display](adr-033-configurable-count-display.md) — optional sidebar counts, shown by default.
- [035: Vault count badge](adr-035-vault-count-badge.md) — native Activity Bar badge for discovered vaults.
- [036: Settings action](adr-036-settings-action.md) — open extension settings from the Vaults view.
- [037: File-description routers](adr-037-file-description-routers.md) — local filename mappings and generated router refreshes.
- [038: Vault row icon](adr-038-vault-row-icon.md) — native archive icon for each vault.
- [040: Configured view headings](adr-040-configured-view-headings.md) — selected-vault folder names for capture and note views.
- [041: Grouped vault folder settings](adr-041-grouped-vault-folder-settings.md) — root, inbox, notes, and templates settings category.
- [042: Compact Vaults view](adr-042-compact-vaults-view.md) — small initial height with native overflow scrolling.

## Creating and processing notes

- [005: Add Note](adr-005-add-note.md) — permanent-note creation.
- [006: Promote Capture](adr-006-promote-capture.md) — moving captures into permanent notes.
- [028: Inline YAML tags](adr-028-inline-yaml-tags.md) — single-line tag lists for generated metadata and vault authoring.
- [015: Note templates](adr-015-note-templates.md) — bundled examples and audit exclusion.
- [016: Fleeting note command](adr-016-fleeting-note-command.md) — creating captures from the vault template.

## Links and references

- [007: Clickable document links](adr-007-document-links.md) — navigating wiki links.
- [008: Go to Definition](adr-008-definition.md) — resolving references.
- [009: Backlinks](adr-009-backlinks.md) — incoming references.
- [010: Link completion](adr-010-completion.md) — completing filename stems.
- [011: Manual reference audit](adr-011-manual-audit.md) — checking notes and links.
- [012: Rename protection](adr-012-rename-protection.md) — warnings and rename limitations.
- [039: Expanded reference groups](adr-039-expanded-reference-groups.md) — default expansion of Inbound and Outbound.

- [043: Underscore file exclusion](adr-043-underscore-file-exclusion.md) — hide supporting files from note views and indexes; reject wiki-link targets.
## Performance and indexing

- [013: Performance at 10,000 notes](adr-013-performance.md) — benchmark and capacity decisions.
- [014: Initial lazy indexing](adr-014-initial-lazy-indexing.md) — superseded background indexing proposal.

## Distribution

- [017: Build and publication](adr-017-build-and-publication.md) — quality matrix, VSIX, release, and Marketplace OIDC.
- [034: Quality and publication alignment](adr-034-quality-and-publication-alignment.md) — lint, formatting, strict audit, and independent release jobs.

## Maintenance rules

- Add an ADR for each feature decision, using the next available `adr-NNN-short-name.md` filename.
- Start each ADR with YAML front matter containing `status`; include context, decision, and consequences.
- Link each ADR here under the relevant topic. Update this index when adding, renaming, or superseding an ADR.
- Keep each ADR's status authoritative; update it when its decision changes. Link superseding decisions from the older ADR.
