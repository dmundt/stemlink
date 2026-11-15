# Stemlink

Build a Zettelkasten in VS Code with plain Markdown files. Capture ideas, connect notes, and find backlinks without a database or account. Your notes remain usable without Stemlink.

## Get started

1. Open a workspace folder and the **Stemlink** activity bar view.
2. Run **Stemlink: Create Zettelkasten**. Choose folder names or accept `zk/inbox` and `zk/notes`.
3. If several vaults are found, select one under **Vaults**. Use **Add Fleeting Note**, **Add Note**, or **Promote Capture to Note**.

The defaults use short, neutral folder names. The bundled manual lists configurable alternatives, including `Fleeting/Permanent` and `Inbox/Knowledge`.

Vault creation includes a manual and editable templates. Existing files are preserved. Promotion preserves the capture's content; rewrite it as needed.

Existing vaults can be recognized by a `.stemlink.json` file in the workspace root or an immediate child folder:

```json
{ "version": 1, "inbox": "fleeting", "notes": "stable" }
```

Folder names are relative to the file. Vaults in all workspace folders appear in the tree. Select one to use its Fleeting and Notes sections; selection stays fixed until changed. Existing settings continue to work without a marker. If settings conflict with a marker for the same vault, choose its configuration.

Use **Stemlink: Open Vault** to select an existing folder. If no marker exists, confirm adding one and choose two existing child folders for captures and permanent notes. Cancellation leaves the folder unchanged. Folders outside discovery scope are added to the current workspace; with no workspace, the vault opens as one. Opening selects the vault without replacing settings, notes, or templates. Workspace Trust is required.

## Connect your notes

Permanent notes use timestamped filenames and YAML front matter. Write tags as a single-line list in every vault Markdown file that uses them:

```markdown
---
title: Filenames are stable addresses
tags: [zettelkasten]
---

Related: [[202411130915-ids-as-timestamps]]
```

- Click a link or press **F12** to navigate; type `[[` for completion.
- Use **Shift+F12** or **References > Inbound** for backlinks. **Outbound** shows links from the active note in the selected vault. Counts are link occurrences.
- Run **Check References** to find broken links and other note issues in the Problems panel. Files starting with `_` are excluded from the check.

Keep permanent filenames stable: renaming can break links. Stemlink warns about renames reported by VS Code, but cannot prevent all renames.

## Large vaults

There is no note-count limit. The selected vault's reference index builds in the background; inbound counts show `...` until ready. A first lookup can wait for indexing. In one 10,000-note benchmark, a cold index took about a minute.
