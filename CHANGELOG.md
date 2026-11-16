# Changelog

## Unreleased

- Preserve unsaved document state during metadata edits and identify the target file or vault in note prompts.

- Request a smaller initial Vaults allocation in fresh layouts, retaining native manual resizing, overflow scrolling, and existing saved sizes.
- Filter Notes by tags through a native multi-select picker with note counts, search-preserved selections, per-vault session state, and a conditional clear action. Show matching counts and active tags; matching ignores case and surrounding whitespace without changing metadata.
- Add vault-row context actions **New permanent note** and **Validate vault**, targeting the right-clicked vault without changing selection. Note creation requires Workspace Trust; validation reuses the reference audit and replaces previous Stemlink Problems results.
- Promote multiple captures by dragging from Fleeting to Notes. Each capture stays in its source vault; cancellation or failure stops the remaining batch. Add `stemlink.confirmPromotion`, enabled by default, to confirm every context-menu or drag promotion separately from metadata prompts.
- Add permanent-note context actions for editing metadata and confirmed deletion, with a warning that inbound links may break.
- Replace the inline/Command Palette promotion action with text-only inbox item context actions: Edit Metadata, Promote to Note, and confirmed Discard. Promotion reuses non-empty YAML title and tags; `stemlink.promptForPromotionMetadata` defaults to `false`. Existing captures require no migration.
- Ask for a headline when adding a fleeting note, preserving the full headline in the body and using a shortened filename slug. The new Capture setting is enabled by default; disable it to retain template-only captures.
- Render existing wiki-link targets as clickable links in VS Code's Markdown preview without changing note source; require Workspace Trust and preserve code, escaped references, and existing Markdown links.
- Group count visibility under **Display** and router indexes and agent-instruction prompts under **AI Context** in Settings.
- Show body-derived titles in inbox router tables, truncated after 120 characters with `...`, instead of missing-description placeholders.
- Hide underscore-prefixed files from capture and permanent-note views and counts; exclude them from reference targets, completion, and backlinks. Check References continues to flag wiki links to these files as malformed.
- Keep deleted notes out of note and reference indexes when delayed editor or filesystem events arrive.

## 0.1.1 - 2026-11-16

- Republish 0.1.0 without functional changes.

## 0.1.0 - 2026-11-16

- Preserve active-vault selection while tree refreshes are in progress.
- Rename the bundled manual to **Stemlink Vault Manual** and use Stemlink vault terminology.
- Give the Vaults view a compact initial height; let VS Code scroll when vault rows exceed it.
- Group root, inbox, notes, and templates settings under **Vault Folders**.
- Match capture and permanent-note view headings to the selected vault's folder names.
- Expand Inbound and Outbound reference groups by default.
- Show a native archive icon before each vault in the Vaults view.
- Place Create Vault before Open Vault in the Vaults toolbar.
- Add filename-to-description mappings to folder routers using YAML description or title; refresh existing generated routers on discovery and observed edits.
- Add a settings action to the Vaults view.
- Show the discovered vault count on the Activity Bar icon when at least one vault is available.
- Add `stemlink.showCounts` to hide sidebar and reference-group counts; counts remain visible by default.
- Show zero counts instead of dashes when no vault is selected.
- Use a plus icon for both Fleeting and Notes creation actions.
- Rename the collection creation action to **Create Vault** and use consistent vault terminology in prompts and messages.
- Show the active vault with native row selection instead of a checkmark or Selected label. Restore the last available vault or select the first listed vault automatically; keep selection across editor changes and refreshes.
- Configure every vault folder through resource-scoped settings, including `stemlink.templates`. Creation prefills folder prompts from settings; explicit template-setting conflicts use the marker/settings chooser without rewriting existing markers.
- Change default vault layout to `notes/` containing `templates/`, `inbox/`, and `permanent/`. Existing markers and explicit settings are preserved; use Open Vault or explicit paths for vaults relying on the previous implicit `zk/inbox/notes` defaults.
- Write tags as single-line YAML lists when creating or promoting notes, including long tag lists.
- Map the templates folder through optional `.stemlink.json` `templates`; old markers default to `templates` without migration.
- Separate Vaults, Fleeting, Notes, and References into native views with workbench dividers.
- Document configurable vault folder naming schemes and clarify that permanent-note identity comes from timestamped filenames.
- Offer optional, scope-specific vault `AGENTS.md` instructions during creation and opening without overwriting existing files.
- Add resource-scoped settings for router automation and agent-instruction prompts; both default to enabled.
- Put bundled editable note, capture, and promotion examples in vault-level `templates/`; retain legacy fleeting-template lookup.
- Include selected vault, capture, and permanent-note folder names in generated manuals, routers, and agent instructions.
- Add AI routing `INDEX.md` files to created and opened vaults with live counts and user-index preservation; routers are non-authoritative, while Stemlink's in-memory note/reference index is authoritative.
- Discover vaults from `.stemlink.json` markers while retaining settings-only vaults.
- Select among workspace vaults in the Stemlink pane, with note and reference counts and background indexing.
- Open existing vault folders from the command palette or Stemlink pane. Confirm marker creation for unmarked folders and choose existing capture and note directories.
