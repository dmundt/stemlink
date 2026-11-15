# Zettelkasten Manual

This is a collection of plain Markdown files: one idea per permanent note, connected by filename. There is no database or required application. Stemlink is optional.

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

Stemlink defaults distinguish the collection from its capture and permanent-note folders. Other Zettelkasten folder schemes can be configured:

| Scheme | Vault root | Inbox/capture | Permanent notes | Rationale |
|---|---|---|---|---|
| Stemlink default | `notes/` | `inbox/` | `permanent/` | Separates the collection, captures, and permanent notes. |
| Previous default | `zk/` | `inbox/` | `notes/` | Short, neutral labels; inbox is also common in GTD workflows. |
| Ahrens-inspired | `Zettelkasten/` | `Fleeting/` | `Permanent/` | Uses fleeting and permanent note terms. |
| Capture labels | `vault/` | `capture/` | `notes/` | Keeps unprocessed captures separate from permanent notes. |
| Lifecycle labels | `vault/` | `inbox/` | `permanent/` | Names the raw-capture and permanent-note stages. |
| Knowledge labels | `vault/` | `Inbox/` | `Knowledge/` | An alternative vocabulary for capture and durable knowledge. |

These are folder names, not note IDs. Stemlink's permanent-note filenames still use timestamps and remain stable after creation; folder names do not provide note identity. Choose folder names during **Create Vault**, use **Open Vault**, or configure paths for an existing vault. Stemlink does not infer alternative layouts from their names.

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

Create `notes/` with `inbox/`, `permanent/`, and `templates/` inside it; put this manual in the root and open the folder in a text editor. Put the vault somewhere your normal backups cover. With Stemlink, **Create Vault** creates the folders and copies the bundled manual and editable examples. The copied manual starts with a summary of your chosen folder names.

Stemlink recognizes `.stemlink.json` in the workspace root or an immediate child folder. Its `inbox` and `notes` values are folder names relative to the file:

```json
{ "version": 1, "inbox": "inbox", "notes": "permanent", "templates": "templates" }
```

Change those names if your folders differ. Optional `templates` names a distinct child folder for editable examples and defaults to `templates` when absent. After moving examples yourself, update this mapping; Stemlink does not move existing files. The layout and paths below use default names; use the configured-folder summary above for this vault. Stemlink restores the last available vault or selects the first listed vault, including a sole vault. Choose another under **Vaults** when needed; native row highlighting shows the selection without a checkmark or Selected label. Editor changes and refreshes keep that selection; removing the selected vault selects the first remaining one. If settings conflict with a marker for the same vault, Stemlink asks which configuration to use. Existing workspace settings also work without this file.

When `stemlink.templates` is unset, the marker's templates mapping is retained. An explicitly configured template name participates in the marker/settings chooser. Choosing settings does not rewrite the marker or move files. Open Vault uses the template setting when adding a new marker but does not install templates.

Existing markers, explicit folder settings, notes, and templates are not migrated or renamed when defaults change. For an old markerless vault that relied on `zk/inbox/notes`, use **Open Vault** or set `stemlink.root=zk`, `stemlink.inbox=inbox`, and `stemlink.notes=notes`. The `notes` setting and marker key still refer to the permanent-note folder, now named `permanent` by default.

Use **Open Vault** to select an existing folder. Without a marker, confirm adding one and choose existing capture and permanent-note folders. Folders outside discovery scope are added to the workspace. Open Vault does not install or move templates in existing vaults; Workspace Trust is required.

### AI routing indexes

Stemlink adds `INDEX.md` at the vault root, inbox, and notes folders when creating or opening a vault. Each file routes AI agents to the relevant folder and reports its current Markdown count. These routers are not authoritative; Stemlink's in-memory note/reference index is authoritative for live state. The routers are not notes; counts exclude `INDEX.md` and `AGENTS.md`. Templates in the separate `templates/` folder are not included in the Notes count. Stemlink does not create missing inbox or notes directories.

Existing user-authored `INDEX.md` files are preserved. Stemlink refreshes only its marked generated section after observed file changes. Text outside that section is yours to edit.

### Agent instructions

Create Vault and Open Vault ask before adding minimal `AGENTS.md` files at the vault root and in existing inbox and notes folders. Existing instruction files are preserved, and missing folders are not created.

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
tags: [zettelkasten, conventions]
---
```

`title` is the editable name. Quote it if it contains a colon. In every vault Markdown file that uses tags, write them as a single-line inline list, such as `tags: [notes, zk, bug]`, not a multiline block list. Choose a few useful lowercase tags rather than a hierarchy. Inbox captures need no front matter.

## 5. Writing a permanent note

Write one idea in your own words, in complete sentences that will make sense later. If the title needs “and,” consider splitting the note. Link it to an existing note where useful:

```markdown
---
title: Note filenames stay frozen after creation
tags: [zettelkasten, conventions]
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

## 7. Daily: capture

Put ideas in `inbox/` quickly. A capture can be a fragment or question; it needs no front matter or links. Most captures do not need to become permanent notes.

Copy `_fleeting.md` from `templates/` into `inbox/`, rename it, and replace the example. With Stemlink, **Add Fleeting Note** copies the saved template into the inbox and opens it. Edit `templates/_fleeting.md` to customize future captures. When the mapped template is missing, Stemlink falls back to `_fleeting.md` in the configured permanent-note folder, such as `permanent/_fleeting.md` or the previous default `notes/_fleeting.md`.

## 8. Weekly: process

Review the inbox regularly:

| Capture | Action |
|---|---|
| Not worth keeping | Delete it. |
| Worth keeping | Rewrite it as one permanent idea with front matter and useful links. |
| Still unfinished | Leave it in the inbox for another review. |

The rewrite is the thinking, not merely moving the file. Stemlink's **Promote Capture to Note** preserves the capture's content; edit it into a permanent note after promotion.

## 9. Finding notes

Search the files for a distinctive word, tag, or filename stem. Browse `permanent/` by timestamp for a rough timeline. Search for a stem to find references to it. In Stemlink, use the Notes tree, link navigation, or **References > Inbound**; run **Check References** when you want an audit.

## 10. Templates

Stemlink copies these editable examples into the configured templates folder (`templates/` by default) during **Create Vault**. They are starting points, not enforced formats. Copy and rename a template before editing:

- `_template.md`: a complete permanent-note example.
- `_fleeting.md`: a quick capture without front matter; its copy belongs in `inbox/`.
- `_promotion.md`: a skeleton for rewriting a capture as a permanent note.

| Part | When copying |
|---|---|
| `title:` | Edit the living name freely. Quote it if it contains a colon. |
| `tags:` | Choose 1–3 useful lowercase tags. |
| Body | Rewrite in your own words as one idea. |
| `[[link]]` | Replace examples with full stems of real notes, in context. |
| Filename | Give a permanent note a new timestamp and slug; keep it stable afterward. |

Templates in `templates/` are outside the Notes tree and reference audit. Legacy underscore-prefixed Markdown files left in the configured permanent-note folder are excluded from **Check References**, but remain visible in Notes and their outgoing links can appear in backlinks; their names are not valid wiki-link targets.

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
