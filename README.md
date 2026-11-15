# Stemlink

Build a Zettelkasten in VS Code with plain Markdown files. Capture ideas, connect notes, and find backlinks without a database or account. Your notes remain usable without Stemlink.

## Get started

1. Open a workspace folder and the **Stemlink** activity bar view.
2. Run **Stemlink: Create Zettelkasten**. Choose folder names or accept `zk/inbox` and `zk/notes`.
3. Use **Add Fleeting Note** to capture an idea, **Add Note** to create a permanent note, or **Promote Capture to Note** to move a capture into notes.

Vault creation includes a manual and editable templates. Existing files are preserved. Promotion preserves the capture's content; rewrite it as needed.

## Connect your notes

Permanent notes use timestamped filenames and YAML front matter:

```markdown
---
title: Filenames are stable addresses
tags: [zettelkasten]
---

Related: [[202411130915-ids-as-timestamps]]
```

- Click a link or press **F12** to navigate; type `[[` for completion.
- Use **Shift+F12** or **Ref To** for backlinks. **Ref From** shows outgoing links.
- Run **Check References** to find broken links and other note issues in the Problems panel. Files starting with `_` are excluded from the check.

Keep permanent filenames stable: renaming can break links. Stemlink warns about renames reported by VS Code, but cannot prevent all renames.

## Large vaults

There is no note-count limit. The first backlink lookup or audit reads note contents and can take time; Stemlink shows indexing in the status bar. In one 10,000-note benchmark, the first cold backlink index took about a minute.
