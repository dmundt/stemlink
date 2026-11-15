# Zettelkasten Manual

This is a collection of plain Markdown files: one idea per permanent note, connected by filename. There is no database or required application. Stemlink is optional.

## 1. Folder layout

```text
zk/
├── .stemlink.json # Stemlink vault configuration
├── README.md   # this manual
├── inbox/      # quick, unprocessed captures
└── notes/      # permanent notes and templates; keep flat
```

These are the default names; use your configured names if they differ. Keep permanent notes in one folder. Use tags and links instead of topic subfolders.

### Folder naming options

Stemlink defaults to short, neutral names. Other Zettelkasten folder schemes can be configured:

| Scheme | Vault root | Inbox/capture | Permanent notes | Rationale |
|---|---|---|---|---|
| Stemlink default | `zk/` | `inbox/` | `notes/` | Short paths without specialized terminology. |
| Ahrens-inspired | `Zettelkasten/` | `Fleeting/` | `Permanent/` | Uses fleeting and permanent note terms. |
| Lifecycle labels | `vault/` | `Inbox/` | `Knowledge/` | Names the capture and durable-knowledge stages. |

These are folder names, not note IDs. Stemlink's permanent-note filenames still use timestamps and remain stable after creation; generic `notes/` does not provide note identity. Choose folder names during **Create Zettelkasten** or configure paths for an existing vault.

## 2. Setup

Create the root, inbox, and notes folders, put this manual in the root, and open the folder in a text editor. Put it somewhere your normal backups cover. With Stemlink, **Create Zettelkasten** creates the folders and copies this manual and the templates.

Stemlink recognizes `.stemlink.json` in the workspace root or an immediate child folder. Its `inbox` and `notes` values are folder names relative to the file:

```json
{ "version": 1, "inbox": "inbox", "notes": "notes" }
```

Change those names if your folders differ. Select a vault under **Vaults** when several are available. If settings conflict with a marker for the same vault, Stemlink asks which configuration to use. Existing workspace settings also work without this file.

Use **Open Vault** to select an existing folder. Without a marker, confirm adding one and choose existing capture and permanent-note folders. Folders outside discovery scope are added to the workspace. Notes and templates are not replaced or installed; Workspace Trust is required.

### AI routing indexes

Stemlink adds `INDEX.md` at the vault root, inbox, and notes folders when creating or opening a vault. Each file routes AI agents to the relevant folder and reports its current Markdown count. These routers are not authoritative; Stemlink's in-memory note/reference index is authoritative for live state. The routers are not notes; counts exclude `INDEX.md` and `AGENTS.md`. Stemlink does not create missing inbox or notes directories.

Existing user-authored `INDEX.md` files are preserved. Stemlink refreshes only its marked generated section after observed file changes. Text outside that section is yours to edit.

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

Copy `_fleeting.md` from `notes/` into `inbox/`, rename it, and replace the example. With Stemlink, **Add Fleeting Note** copies the saved template into the inbox and opens it. Edit the template to customize future captures.

## 8. Weekly: process

Review the inbox regularly:

| Capture | Action |
|---|---|
| Not worth keeping | Delete it. |
| Worth keeping | Rewrite it as one permanent idea with front matter and useful links. |
| Still unfinished | Leave it in the inbox for another review. |

The rewrite is the thinking, not merely moving the file. Stemlink's **Promote Capture to Note** preserves the capture's content; edit it into a permanent note after promotion.

## 9. Finding notes

Search the files for a distinctive word, tag, or filename stem. Browse `notes/` by timestamp for a rough timeline. Search for a stem to find references to it. In Stemlink, use the Notes tree, link navigation, or **References > Inbound**; run **Check References** when you want an audit.

## 10. Templates

Copy and rename a template before editing:

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

Stemlink's **Check References** ignores Markdown files in `notes/` whose names start with `_`, including templates. Other invalid filenames are reported. Underscore files remain visible in the Notes tree and their outgoing links can appear in backlinks; their names are not valid wiki-link targets.

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
6. Keep `notes/` flat and back up the vault.
