# Changelog

## Unreleased

- Rename the **Create Zettelkasten** action to **Create Vault** and use consistent vault terminology in prompts and messages.
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
