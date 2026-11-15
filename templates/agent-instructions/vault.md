# Agent instructions

- Keep vault content in plain Markdown. Preserve existing notes unless asked to edit them.
- Treat `INDEX.md` as navigation only, not authoritative. Stemlink's in-memory note/reference index is authoritative for live extension state; read Markdown files for note content.
- Permanent-note filenames are stable timestamped IDs. Do not rename them; use full filename stems in wiki links.
- When writing YAML tags in any vault Markdown file, use a single-line list such as `tags: [notes, zk, bug]`, not a block list.
- Keep permanent notes flat in the configured notes folder. Copy examples from the vault-level {{templates}} folder before editing.

## This vault's folders

- Vault root: {{vaultRoot}}
- Capture folder: {{inbox}}
- Permanent-note folder: {{notes}}
- Editable examples: {{templates}}
