# Stemlink

[![Local Extension Quality](https://github.com/dmundt/stemlink/actions/workflows/quality.yml/badge.svg)](https://github.com/dmundt/stemlink/actions/workflows/quality.yml)

Build a Stemlink vault in VS Code with plain Markdown files. Capture ideas, connect notes, and find backlinks without a database or account. Your notes remain usable without Stemlink.

## Get started

1. Open a workspace folder and the **Stemlink** activity bar view.
2. Run **Stemlink: Create vault**. Accept `notes/` containing `templates/`, `inbox/`, and `permanent/`, or choose your own names.
3. Stemlink restores the last available vault or selects the first listed vault. Choose another under **Vaults** when needed. Use **New fleeting note** or **New permanent note**; right-click an inbox capture for **Promote to permanent note…**.

The Activity Bar badge shows the number of discovered vaults in the workspace; it is hidden when there are none. It remains visible when `stemlink.showCounts` hides view counts.

Vaults requests a small share of space in new sidebar layouts. Drag the divider below it to resize; overflowing vaults use the native scrollbar. VS Code preserves saved view sizes. Automatic sizing to exactly 1–8 vault rows is not available through the supported extension API.

Restricted Mode supports browsing, navigation, tag filtering, validation, and read-only refresh. File changes, generated indexes, agent instructions, and Markdown preview links require Workspace Trust. When no vault exists, the Vaults welcome explains workspace prerequisites and links to available open/create actions.

Refresh rediscovers vaults and retries the selected vault's note index and failed listing counts. Views distinguish empty lists, no tag matches, and loading failures. References explains when the active note belongs to another vault; selecting that vault remains manual.

Marker errors offer **Open configuration**; invalid folder settings offer **Settings**. Healthy vaults remain available when another configuration fails. If discovery leaves no vaults, Vaults shows recovery guidance rather than first-run setup. Display, capture, and instruction preferences do not rediscover vaults.

Right-click a vault under **Vaults** for **New fleeting note**, **New permanent note**, or **Validate vault**. All use that vault without changing the selection. Fleeting-note creation uses its template and headline preference; permanent-note creation asks for title and optional tags. Both open the new file and require Workspace Trust. A separator groups creation apart from validation. Validation checks permanent notes, including unsaved content, and offers **Show Problems**. Successful validation replaces previous Stemlink validation results across vaults; failure preserves them. Validation does not change files.

The default root holds the collection; `inbox/` holds captures, `permanent/` holds permanent notes, and `templates/` holds editable examples. The bundled manual lists alternatives: `zk/inbox/notes`, `Stemlink vault/Fleeting/Permanent`, `vault/capture/notes`, and `vault/inbox/permanent`. Use Open vault or settings for these layouts; Stemlink does not infer a layout from its folder names.

Capture and permanent-note view headings use the selected vault's folder names, preserving their spelling and case. View descriptions identify the selected vault, disambiguating duplicate names by workspace. Switching vaults updates these headings; counts follow `stemlink.showCounts`. Without a selected vault, the headings remain Fleeting and Notes.

Vault creation copies the bundled manual to the vault root and personalizes its folder summary with your chosen names. Editable Markdown examples go into the mapped templates folder (`templates/` by default). `INDEX.md` routers and accepted `AGENTS.md` instructions also include configured folder names; existing files are preserved. The root router links to folder routers; each folder router maps local Markdown filenames to YAML `description`, falling back to `title`. Missing metadata is labeled explicitly. Routers help choose files to read, not replace reading them; Stemlink's in-memory note/reference index is authoritative for live state. Stemlink updates only generated sections on discovery, observed filesystem changes, edits (including unsaved metadata), and **Refresh**. Promotion preserves the capture's content; rewrite it as needed.

New fleeting note reads `_fleeting.md` from the mapped templates folder first and falls back to the configured notes folder for existing vaults. If both are missing, **Use bundled template once** creates one capture without installing a template or changing settings. Dismissal creates nothing.

By default, **New fleeting note** asks for a headline. It adds the full headline as a Markdown heading before the template body and uses a filename such as `202611161400-short-headline.md`. Filename slugs are capped at 48 characters; duplicates get numeric suffixes. Cancel creates nothing. Disable **Capture > Prompt For Capture Headline** (`stemlink.promptForCaptureHeadline`) to copy the template unchanged with a timestamped `capture` filename. Existing captures are unchanged.

Right-click an inbox capture for **Promote to permanent note…**, **Edit metadata…**, or **Delete…**, in that order. A separator places Delete last. These text-only actions live in the item context menu, not the toolbar or Command Palette. Edit metadata asks for title and optional comma-separated tags, preserving the body and unrelated YAML fields. Promotion reuses non-empty title and tags by default; missing or empty fields are prompted separately. Enable `stemlink.promptForPromotionMetadata` under **Capture** to always review both fields. Promotion saves the permanent note before removing the capture. Delete requires confirmation and refuses unsaved changes; save or revert them first. Metadata and Delete are single-capture actions, disabled for multiple selections. All three actions require Workspace Trust.

Promote selected captures through their context menu or by dragging them from Fleeting onto the Notes view background or a note row. Each capture stays in its own vault, even when Notes displays another vault; the drop target note is unchanged. Captures promote sequentially. Batches show native progress and completed/remaining counts, opening only the last created note. Every promotion asks for confirmation by default. Set `stemlink.confirmPromotion` to `false` under **Capture** to skip confirmation; metadata prompts remain separate. Cancel or error stops the batch, leaving completed promotions intact and remaining captures untouched.

Right-click a permanent note for **Edit metadata…**. Metadata changes preserve the filename, body, and unrelated YAML and require Workspace Trust. Stemlink does not offer deletion of permanent notes; retain them as stable reference targets. Native VS Code file operations remain available outside Stemlink.

Deleted files leave navigation and reference indexes even if an editor remains open. Indexing does not discard editor buffers; recreating the file indexes it again. Confirmed capture deletion uses native VS Code file operations and honors `files.enableTrash`.

Metadata prompts identify the target file or vault. Editing metadata saves an originally clean document, but leaves an already-dirty document unsaved, including its body and metadata changes. Save it through the editor when ready; the in-memory index follows unsaved content.

Use **Filter by tags…** in the Notes view menu to select existing tags. The native picker lists tags alphabetically with counts across that vault; typing narrows choices without clearing checked tags. Enter applies and Escape keeps the previous filter. Notes match any checked tag; selecting none or choosing **Clear tag filter** shows all notes. Active tags appear in the view description, and the heading count shows matching notes when counts are enabled.

Creating or promoting a note does not clear an active tag filter. If the displayed vault's filter hides the new note, a notice offers **Clear tag filter**. The note still opens normally.

Tag filters are independent per vault and last only for the current session. Matching ignores surrounding whitespace and case without changing YAML. Counts include unsaved note edits and count each note once per tag. A selected tag that disappears stays selected with count 0. Invalid YAML or tag lists are reported and excluded from matches; affected notes remain visible when unfiltered. Filtering is read-only and available without Workspace Trust.

Invalid tag metadata appears as **Stemlink tags** Problems at the invalid YAML or tags key, separate from manual validation. Notifications summarize the affected count and offer **Show Problems** instead of listing every file. Editing an already-invalid file updates diagnostics quietly; fixes and deletions clear obsolete entries. An empty tag picker explains how to add YAML tags.

Files starting with `_` are hidden from capture and permanent-note views and counts, and excluded from note indexing, completion, backlinks, and audits as source notes. Wiki links to these files are invalid and reported by **Validate vault**. Existing files remain on disk.

Inbox router tables use a **Title** column derived from the first non-empty body line or sentence, capped at 120 characters with `...` when truncated. Empty captures are labeled explicitly. Permanent-note routers retain YAML descriptions with title fallback.

Vault `AGENTS.md` files are optional. With `stemlink.offerAgentInstructions` enabled (default: `true`), Create vault and Open vault ask before adding missing instructions to the vault root, inbox, and permanent-note folders. Set it to `false` to skip both the prompt and installation. Existing files are preserved, not removed when the setting is disabled.

Choosing **Skip** for optional agent instructions suppresses another offer for that vault during the current extension session. Dismissing the dialog does not store a preference. Other vaults still offer; restart resets temporary suppression. Disable `stemlink.offerAgentInstructions` for a permanent opt-out.

## Extension settings

Use **Settings** in the **Vaults** view menu or **Stemlink: Settings** to open Stemlink settings.

Settings are resource-scoped and apply to the workspace folder containing each vault. Defaults:

The `stemlink.root`, `stemlink.inbox`, `stemlink.notes`, and `stemlink.templates` settings appear together under **Stemlink › Vault Folders** in VS Code Settings.

Create vault checks folder names and collisions before accepting each answer. New vaults reject reserved Windows device names such as `CON` and `COM1.txt` on every platform; existing vaults remain readable. Invalid template defaults offer Settings before any folder is created.

**Display** contains sidebar count visibility. **AI Context** contains router indexes and agent-instruction prompts; these prepare local files for AI tools without adding built-in AI or provider calls.

**Capture** contains headline and promotion metadata prompts. `stemlink.promptForPromotionMetadata` defaults to `false`; an empty tags list still prompts for optional tags, and submitting it empty is allowed.

| Setting                               |     Default | Purpose                                                                                                                                                                           |
| ------------------------------------- | ----------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stemlink.root`                       |     `notes` | Workspace-relative vault root for settings-based discovery.                                                                                                                       |
| `stemlink.inbox`                      |     `inbox` | Capture folder name inside the vault.                                                                                                                                             |
| `stemlink.notes`                      | `permanent` | Permanent-note folder name inside the vault.                                                                                                                                      |
| `stemlink.templates`                  | `templates` | Editable-example folder name inside the vault.                                                                                                                                    |
| `stemlink.showCounts`                 |      `true` | Show counts in the sidebar views and reference groups; errors remain visible when counts are hidden.                                                                              |
| `stemlink.promptForCaptureHeadline`   |      `true` | Ask for a headline before creating a fleeting note; disable to copy the saved template unchanged.                                                                                 |
| `stemlink.promptForPromotionMetadata` |     `false` | Always review promotion title and tags; otherwise prompt only for missing or empty metadata.                                                                                      |
| `stemlink.confirmPromotion`           |      `true` | Confirm every promotion, including each capture in a context-menu or drag batch.                                                                                                  |
| `stemlink.enableRouterIndexes`        |      `true` | Create routers on explicit Create/Open and refresh generated counts and file descriptions on discovery and observed changes. Disabled leaves existing `INDEX.md` files untouched. |
| `stemlink.offerAgentInstructions`     |      `true` | Ask before adding missing vault `AGENTS.md` files during Create/Open. Disabled skips prompts and installation.                                                                    |

To share user-level Stemlink settings across devices, enable [VS Code Settings Sync](https://code.visualstudio.com/docs/configure/settings-sync) on each device, sign in, and include **Settings**. Excluded settings do not sync. Workspace and workspace-folder overrides, including paths saved by Create vault, do not sync through Settings Sync. Vault files and workspace selection are not synced by Stemlink.

Configure all four names in VS Code settings, for example:

```json
{
  "stemlink.root": "vault",
  "stemlink.inbox": "capture",
  "stemlink.notes": "permanent",
  "stemlink.templates": "examples"
}
```

Create vault prefills its three editable folder prompts from settings and uses the configured templates name without another prompt. Names must be single folder names; capture, permanent-note, and template folders must be distinct ignoring case. Creation saves the chosen settings and writes a new marker without overwriting an existing one.

Existing vaults can be recognized by a `.stemlink.json` file in the workspace root or an immediate child folder:

```json
{ "version": 1, "inbox": "inbox", "notes": "permanent", "templates": "templates" }
```

Folder names are relative to the file. Optional `templates` defaults to `templates`; set it to another distinct child folder such as `examples` to use your own template location. Existing markers need no migration and are not rewritten. Vaults in all workspace folders appear in the tree. Native row highlighting shows the selected vault without a checkmark or Selected label. Selection stays fixed across editor changes and refreshes; if that vault disappears, Stemlink selects the first remaining vault. Existing settings continue to work without a marker. If settings conflict with a marker for the same vault, choose its configuration.

An unset `stemlink.templates` retains the marker's template mapping. An explicit template setting participates in the configuration chooser when it conflicts with the marker. Choosing settings changes the effective paths without rewriting either configuration. Changing names never moves existing files.

The new defaults do not move or rename existing vaults. Existing markers and explicit folder settings retain their values. If an old vault relied on implicit defaults, use **Open vault** or explicitly set its root, capture, and permanent-note names, for example `root=zk`, `inbox=inbox`, `notes=notes`.

Use **Stemlink: Open vault** to select an existing folder. If no marker exists, confirm adding one and choose two existing child folders for captures and permanent notes. Cancellation leaves the folder unchanged. Folders outside discovery scope are added to the current workspace; with no workspace, the vault opens as one. Opening selects the vault without replacing settings, notes, or templates. Workspace Trust is required.

## Connect your notes

Permanent notes use timestamped filenames and YAML front matter. Write tags as a single-line list in every vault Markdown file that uses them:

```markdown
---
title: Filenames are stable addresses
tags: [stemlink-vault]
---

Related: [[202411130915-ids-as-timestamps]]
```

- Click a link or press **F12** to navigate; type `[[` for completion.
- In VS Code's built-in Markdown preview, existing `[[stem]]` targets render as clickable links without changing source text. Workspace Trust is required. Code, escaped references, and existing Markdown links stay unchanged; missing or invalid targets remain literal.
- Use **Shift+F12** or **References > Inbound** for backlinks. Inbound rows include the source line and an excerpt. **Outbound** shows links from the active note in the selected vault; missing links open their source location. Counts are link occurrences.
- Run **Validate vault** to find broken links and other note issues in the Problems panel. Files starting with `_` are excluded from the check.

Keep permanent filenames stable: renaming can break links. Stemlink warns about renames reported by VS Code, but cannot prevent all renames.

## Large vaults

There is no note-count limit. The selected vault's reference index builds in the background; inbound counts show `...` until ready. A first lookup can wait for indexing. In one 10,000-note benchmark, a cold index took about a minute.
