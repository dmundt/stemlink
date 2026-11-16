# Stemlink Vault Manual

This is a collection of plain Markdown files: one idea per permanent note, connected by filename. There is no database or required application. Stemlink is optional.

Restricted Mode supports browsing, navigation, tag filtering, validation, and read-only refresh. Trust the workspace before changing files, generating indexes or agent instructions, or rendering wiki links in Markdown preview. The empty Vaults welcome links to existing open/create actions and explains workspace prerequisites.

Use Refresh in Vaults to rediscover vaults and retry failed lists. View messages distinguish empty notes, no tag matches, and loading errors. References explains when the active editor is not a permanent note in the selected vault; editor changes never select another vault automatically.

Metadata dialogs identify their target. Editing metadata leaves an already-unsaved document dirty rather than saving unfinished body edits. Originally clean documents are saved normally; indexes still include unsaved content.

Validation identifies the checked vault and offers Show Problems. Successful validation replaces previous Stemlink validation results globally; a failed run keeps them.

Context-menu promotion and drag/drop process the same capture selection sequentially, with per-capture confirmation and batch progress. Cancellation or failure leaves completed work intact and reports remaining captures. Batches open only the last created note. Metadata and Discard apply to one capture at a time.

Tag metadata errors appear under Stemlink tags in Problems. A short notification gives their count and offers Show Problems. These diagnostics update with the note index and do not replace manual validation results.

Visible actions use the same names across entry points: New fleeting note, New permanent note, and Validate vault. Settings is in the Vaults view menu. Existing command IDs and note files are unchanged.

Choose Skip to suppress optional agent-instruction offers for this vault during the current extension session. Other vaults remain independent; restart resets suppression. The existing offerAgentInstructions setting provides a permanent opt-out.

<!-- stemlink:configured-folders -->

## 1. Folder layout

```text
notes/
├── .stemlink.json # Stemlink vault configuration
├── README.md      # this manual
├── inbox/         # quick, unprocessed captures
├── permanent/     # permanent notes; keep flat
└── templates/     # editable Markdown examples
    ├── _template.md
    ├── _fleeting.md
    └── _promotion.md
```

These are the default names; use your configured names if they differ. Capture, permanent-note, and template folder names must be distinct ignoring case. Keep permanent notes in one folder. Use tags and links instead of topic subfolders.

### Folder naming options

Stemlink defaults distinguish the collection from its capture and permanent-note folders. Other Stemlink vault folder schemes can be configured:

| Scheme           | Vault root        | Inbox/capture | Permanent notes | Rationale                                                     |
| ---------------- | ----------------- | ------------- | --------------- | ------------------------------------------------------------- |
| Stemlink default | `notes/`          | `inbox/`      | `permanent/`    | Separates the collection, captures, and permanent notes.      |
| Previous default | `zk/`             | `inbox/`      | `notes/`        | Short, neutral labels; inbox is also common in GTD workflows. |
| Ahrens-inspired  | `Stemlink vault/` | `Fleeting/`   | `Permanent/`    | Uses fleeting and permanent note terms.                       |
| Capture labels   | `vault/`          | `capture/`    | `notes/`        | Keeps unprocessed captures separate from permanent notes.     |
| Lifecycle labels | `vault/`          | `inbox/`      | `permanent/`    | Names the raw-capture and permanent-note stages.              |
| Knowledge labels | `vault/`          | `Inbox/`      | `Knowledge/`    | An alternative vocabulary for capture and durable knowledge.  |

These are folder names, not note IDs. Stemlink's permanent-note filenames still use timestamps and remain stable after creation; folder names do not provide note identity. Choose folder names during **Create vault**, use **Open vault**, or configure paths for an existing vault. Stemlink does not infer alternative layouts from their names.

Set `stemlink.showCounts` to `false` to hide sidebar and reference-group counts. It defaults to `true`; errors remain visible. The Activity Bar badge still shows the number of discovered vaults when there is at least one.

Use the gear in the **Vaults** view or **Stemlink: Settings** to open Stemlink settings.

The capture and permanent-note view headings match the selected vault's configured folder names, including their case. Selecting another vault updates them; without a selected vault, they remain Fleeting and Notes.

VS Code Settings Sync can share user-level Stemlink settings between devices when enabled with **Settings** selected. Workspace and workspace-folder overrides, vault files, and the selected vault are not synced by Stemlink.

All four names can be set in VS Code settings:

```json
{
  "stemlink.root": "notes",
  "stemlink.inbox": "inbox",
  "stemlink.notes": "permanent",
  "stemlink.templates": "templates"
}
```

Creation prefills its root, capture, and permanent-note prompts from these settings. The templates folder uses its setting without another prompt. Names must be single folder names, not nested paths.

## 2. Setup

Create `notes/` with `inbox/`, `permanent/`, and `templates/` inside it; put this manual in the root and open the folder in a text editor. Put the vault somewhere your normal backups cover. With Stemlink, **Create vault** creates the folders and copies the bundled manual and editable examples. The copied manual starts with a summary of your chosen folder names.

Stemlink recognizes `.stemlink.json` in the workspace root or an immediate child folder. Its `inbox` and `notes` values are folder names relative to the file:

```json
{ "version": 1, "inbox": "inbox", "notes": "permanent", "templates": "templates" }
```

Change those names if your folders differ. Optional `templates` names a distinct child folder for editable examples and defaults to `templates` when absent. After moving examples yourself, update this mapping; Stemlink does not move existing files. The layout and paths below use default names; use the configured-folder summary above for this vault. Stemlink restores the last available vault or selects the first listed vault, including a sole vault. Choose another under **Vaults** when needed; native row highlighting shows the selection without a checkmark or Selected label. Editor changes and refreshes keep that selection; removing the selected vault selects the first remaining one. If settings conflict with a marker for the same vault, Stemlink asks which configuration to use. Existing workspace settings also work without this file.

When `stemlink.templates` is unset, the marker's templates mapping is retained. An explicitly configured template name participates in the marker/settings chooser. Choosing settings does not rewrite the marker or move files. Open vault uses the template setting when adding a new marker but does not install templates.

Existing markers, explicit folder settings, notes, and templates are not migrated or renamed when defaults change. For an old markerless vault that relied on `zk/inbox/notes`, use **Open vault** or set `stemlink.root=zk`, `stemlink.inbox=inbox`, and `stemlink.notes=notes`. The `notes` setting and marker key still refer to the permanent-note folder, now named `permanent` by default.

Use **Open vault** to select an existing folder. Without a marker, confirm adding one and choose existing capture and permanent-note folders. Folders outside discovery scope are added to the workspace. Open vault does not install or move templates in existing vaults; Workspace Trust is required.

### AI routing indexes

Stemlink adds `INDEX.md` at the vault root, inbox, and notes folders when creating or opening a vault. The root routes readers to folder indexes; each folder index maps local Markdown filenames to YAML `description`, falling back to `title`, and reports its Markdown count. Missing metadata is labeled explicitly. Use these descriptions to choose files to read, not as a replacement for their content. These routers are not authoritative; Stemlink's in-memory note/reference index is authoritative for live state. The routers are not notes; counts exclude `INDEX.md` and `AGENTS.md`. Templates in the separate `templates/` folder are not included in the Notes count. Stemlink does not create missing inbox or notes directories.

Existing user-authored `INDEX.md` files are preserved. Stemlink refreshes only its marked generated section on discovery, observed file changes, edits (including unsaved metadata), and **Refresh**. Text outside that section is yours to edit. Malformed YAML is reported and labeled in the mapping. Saved routers may temporarily reflect unsaved note metadata; reverting the note updates its router again.

### Agent instructions

`AGENTS.md` files are optional. With `stemlink.offerAgentInstructions` enabled (default: `true`), Create vault and Open vault ask before adding missing instructions at the vault root and in existing inbox and permanent-note folders. Set it to `false` to skip both the prompt and installation. Existing instruction files are preserved, not removed when the setting is disabled; missing folders are not created.

## 3. Naming files

Use the local creation time and a short, lowercase, hyphenated slug:

```text
YYYYMMDDHHMM-short-slug.md
202411141030-note-filenames-stay-frozen.md
```

Check that the name is unused; add a short suffix if necessary. Once a permanent note is created, keep its filename: links use that filename as its address. Edit the `title` as the idea changes instead of renaming the file.

## 4. Front matter

Permanent notes use two YAML fields:

```yaml
---
title: Note filenames stay frozen after creation
tags: [stemlink-vault, conventions]
---
```

`title` is the editable name. Quote it if it contains a colon. In every vault Markdown file that uses tags, write them as a single-line inline list, such as `tags: [notes, zk, bug]`, not a multiline block list. Choose a few useful lowercase tags rather than a hierarchy. Inbox captures need no front matter.

## 5. Writing a permanent note

Write one idea in your own words, in complete sentences that will make sense later. If the title needs “and,” consider splitting the note. Link it to an existing note where useful:

```markdown
---
title: Note filenames stay frozen after creation
tags: [stemlink-vault, conventions]
---

A filename is a stable address; the title can change as the idea develops.
Renaming the file can break links to it.

Related: [[202411130915-ids-as-timestamps]]
```

The first note has nothing to link to; do not invent a reference. Replace example links with real note names.

## 6. Linking

Write the full filename stem, without `.md`, in the body:

```text
See [[202411130915-ids-as-timestamps]] for the trade-offs.
```

The stem is the filename, not the title. To find backlinks without an extension, search all notes for that stem. Stemlink can navigate existing links, complete stems, and show backlinks.

In VS Code's built-in Markdown preview, Stemlink renders existing wiki-link targets as clickable links while keeping the Markdown source unchanged. Workspace Trust is required. Inline and block code, escaped references, and existing Markdown links stay unchanged. Missing or invalid references keep their brackets; run **Validate vault** for diagnostics. Other Markdown viewers need their own wiki-link support.

## 7. Daily: capture

Put ideas in `inbox/` quickly. A capture can be a fragment or question; it needs no front matter or links. Most captures do not need to become permanent notes.

Copy `_fleeting.md` from `templates/` into `inbox/`, rename it, and replace the example. With Stemlink, **New fleeting note** copies the saved template into the inbox and opens it. Edit `templates/_fleeting.md` to customize future captures. When the mapped template is missing, Stemlink falls back to `_fleeting.md` in the configured permanent-note folder, such as `permanent/_fleeting.md` or the previous default `notes/_fleeting.md`.

The command asks for a headline by default. The full headline becomes a Markdown heading before the template body, after any YAML front matter. The timestamped filename uses a safe headline slug capped at 48 characters, with a numeric suffix for collisions. Cancel creates no file. Turn off `stemlink.promptForCaptureHeadline` under **Capture** settings to keep template-only captures named with `capture`. This affects new captures only.

## 8. Weekly: process

Review the inbox regularly:

| Capture           | Action                                                               |
| ----------------- | -------------------------------------------------------------------- |
| Not worth keeping | Delete it.                                                           |
| Worth keeping     | Rewrite it as one permanent idea with front matter and useful links. |
| Still unfinished  | Leave it in the inbox for another review.                            |

The rewrite is the thinking, not merely moving the file. Right-click a capture in Stemlink's inbox tree for:

- **Edit metadata…**: Enter a title and optional comma-separated tags. This adds or updates YAML without changing the body or unrelated fields. Cancel either prompt to leave the capture unchanged.
- **Promote to permanent note…**: Create a permanent note in the same vault, preserving the body, unrelated YAML, and wiki links. Non-empty title and tags are reused; only missing or empty fields prompt. Set `stemlink.promptForPromotionMetadata` to `true` under Capture settings to always review both fields (default: `false`). Empty tags are allowed. The source is removed only after the new note is saved.
- **Discard…**: Confirm deletion in a warning showing the capture filename. Cancel or dismiss changes nothing. Save or revert unsaved changes before discarding.

These are text-only item context actions, not inline buttons or Command Palette commands. They require Workspace Trust and target the right-clicked capture, even when another vault or editor is selected. Invalid YAML or field types are reported rather than silently replaced. Edit the note's content yourself; promotion does not rewrite it.

Alternatively, select captures in Fleeting and drag them onto the Notes view background or a note row. Each capture promotes into its own vault, not the displayed destination vault; dropping onto a note does not edit it. Each promotion asks for confirmation unless `stemlink.confirmPromotion` is disabled (default: `true`). This is separate from metadata prompts. Batches run sequentially and stop on cancellation or error; completed promotions remain and unprocessed captures stay in the inbox.

## 9. Finding notes

Search the files for a distinctive word, tag, or filename stem. Browse `permanent/` by timestamp for a rough timeline. Search for a stem to find references to it. In Stemlink, use the Notes tree, link navigation, or **References > Inbound**; run **Validate vault** when you want an audit.

Right-click a vault in **Vaults** for **New permanent note** or **Validate vault** without selecting it first. Creation asks for title and optional tags, writes to that vault's configured permanent-note folder, and requires Workspace Trust. Validation runs the same audit as Validate vault, includes unsaved note content, and replaces previous Stemlink Problems results across vaults without changing files. Neither action changes the selected vault.

Vaults starts with a small relative allocation in new sidebar layouts. Drag its lower divider to resize it and use the native scrollbar for overflow. Existing saved sizes remain unchanged; the public extension API cannot enforce automatic sizing to exactly 1–8 vault rows.

Right-click a permanent note in the Notes tree for **Edit metadata…** or **Delete…**. Metadata editing preserves its filename, body, and unrelated YAML. Delete warns that inbound wiki links may break and requires confirmation; links are not rewritten. Save or revert unsaved changes first. Both actions require Workspace Trust.

Choose **Filter by tags…** in the Notes view menu for a native multi-select picker with alphabetical tags and full-vault note counts. Search preserves checked tags. Enter applies; Escape keeps the previous selection. Notes matching any selected tag are shown; no selection shows all notes. Active tags appear beside the view heading, whose count reflects matching notes. **Clear tag filter** appears only while filtering.

Filters are per vault and session-only. Tag matching trims whitespace and ignores case without editing metadata. Unsaved note edits update results and counts; duplicate tags count once per note. Missing selected tags remain selectable with count 0. Invalid YAML or tag lists are reported, excluded from tag matches, and remain visible unfiltered. Filtering requires no Workspace Trust and does not change note opening or audit diagnostics.

## 10. Templates

Inbox `INDEX.md` tables show body-derived titles: the first non-empty line or sentence, capped at 120 characters with `...` when truncated. YAML front matter is skipped. Empty captures show `Empty capture.`; permanent-note routers continue to use YAML description or title.

Stemlink copies these editable examples into the configured templates folder (`templates/` by default) during **Create vault**. They are starting points, not enforced formats. Copy and rename a template before editing:

- `_template.md`: a complete permanent-note example.
- `_fleeting.md`: a quick capture without front matter; its copy belongs in `inbox/`.
- `_promotion.md`: a skeleton for rewriting a capture as a permanent note.

| Part       | When copying                                                              |
| ---------- | ------------------------------------------------------------------------- |
| `title:`   | Edit the living name freely. Quote it if it contains a colon.             |
| `tags:`    | Choose 1–3 useful lowercase tags.                                         |
| Body       | Rewrite in your own words as one idea.                                    |
| `[[link]]` | Replace examples with full stems of real notes, in context.               |
| Filename   | Give a permanent note a new timestamp and slug; keep it stable afterward. |

Templates in `templates/` are outside the Notes tree and reference audit. Files whose names start with `_` are hidden from capture and permanent-note views and their counts, excluded from note indexing, completion, backlinks, and **Validate vault** as source notes. Wiki links targeting these files are invalid and reported as malformed references. Existing files are not moved or deleted; the legacy `_fleeting.md` template fallback still works.

## 11. Maintenance and troubleshooting

- **A link does not resolve:** Check the full filename stem and whether the target exists. Renaming a file can break its incoming links. Stemlink warns about renames reported by VS Code, but external renames can go unnoticed.
- **A note is hard to find:** Search for a distinctive word, tag, or stem. Use links and tags rather than adding subfolders.
- **A note contains several ideas:** Split it into focused notes and connect them where useful.
- **Processing feels slow:** Delete captures that are no longer useful; the inbox is a queue, not an archive.
- **You want more structure:** Wait until you repeatedly miss it, then add the smallest thing that helps.
- **Backups:** Sync or back up the entire root folder using your preferred method.

## 12. Rules at a glance

1. One idea per permanent note.
2. Keep permanent filenames stable; edit titles instead.
3. Use YAML `title` and `tags` on permanent notes.
4. Link to related notes where useful; do not invent links.
5. Review the inbox regularly and rewrite what is worth keeping.
6. Keep `permanent/` flat and back up the vault.
