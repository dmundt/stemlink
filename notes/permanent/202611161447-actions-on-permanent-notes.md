---
title: Actions on Permanent Notes
tags: [feature, idea, permanent-notes]
---

# Actions on Permanent Notes

Idea: Provide simple right-click actions for permanent notes, similar to inbox capture actions.

## Interaction

Click a note to open it for editing. Right-click a note in the Notes tree for text-only actions:

- **Edit Metadata...**: Add or update the YAML title and tags.
- **Delete...**: Show the note filename and ask for confirmation before deleting it. Cancel or dismiss leaves the note unchanged.

Separate Delete from other actions. Do not add icons, inline buttons, toolbar actions, shortcuts, or Command Palette entries. Use the existing editor, link completion, Markdown preview, and Explorer instead of duplicating their features.

## Safety and implementation

- Use native VS Code controls and operate on the right-clicked note in its own vault, not the active editor or selected vault.
- Reuse capture metadata editing where practical. Prefill title and tags; preserve the body and unrelated YAML fields. Cancel either prompt without changes and report invalid metadata.
- Require Workspace Trust for mutations. Refuse deletion of unsaved changes; detect changes made while confirmation is open.
- Deleting a note can break inbound wiki links. Warn about this before confirmation; do not silently rewrite references. Do not claim there are no backlinks while the index is pending or unavailable.
- Refresh affected views and indexes after success. Report failures through existing error handling; avoid routine success notifications.
- Keep filenames stable when editing metadata. Do not add promotion or inbox-specific actions to permanent notes.
