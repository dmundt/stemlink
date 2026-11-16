---
title: Actions on inbox captures
tags: [feature, idea, captures, inbox]
---

## Interaction

Use the existing inbox tree and native VS Code controls. Click a capture to open it for editing; right-click it for three text-only actions:

- **Edit Metadata...**: Add or update YAML `title` and `tags`.
- **Promote to Note...**: Turn the capture into a permanent note in the same vault.
- **Discard...**: Ask before deleting the capture. Show its filename in a native modal warning with **Discard** and **Cancel** actions. Delete only after explicit confirmation; cancel or dismiss changes nothing.

Separate Discard from the other menu items. Do not add icons, inline buttons, view-title actions, dedicated shortcuts, or Command Palette entries for these capture actions.

Do not add separate Edit, Title, Tag, Link, View, or Rename actions. Editing already uses the normal editor; metadata editing covers title and tags. Use existing wiki-link completion, built-in Markdown preview, and Explorer rename instead of duplicating them.

## What promotion means

Promotion turns a fleeting inbox capture into a permanent note in the same vault. A permanent note expresses one clear idea in your own words, with enough context to remain understandable later. Review and refine the capture before promoting it; moving a file alone does not make its content permanent-note quality.

The Promote action:

- Reuses valid, non-empty YAML `title` and `tags` without asking again by default. If either field is missing or empty, asks only for that field: a non-empty title or optional tags.
- Creates a note in the configured permanent-note folder with a timestamped, title-based filename and YAML `title` and `tags`.
- Preserves the capture body, existing unrelated YAML fields, and wiki links. It does not summarize, rewrite, or invent content.
- Removes the inbox source only after the permanent note has been saved successfully, then opens the result and refreshes affected indexes.
- Leaves the capture unchanged if the user cancels or creation fails. Never overwrites an existing note.

## Capture metadata and promotion prompts

**Edit Metadata...** uses two native VS Code textboxes: a required title, then optional comma-separated tags. Prefill existing values. Add YAML front matter if missing; otherwise update only these fields. Save tags as a single-line YAML list. Preserve unrelated fields and the entire body. Cancel either prompt without applying partial changes. Report invalid YAML or invalid field types instead of silently replacing them.

Add resource-scoped `stemlink.promptForPromotionMetadata`, default `false`, under Capture settings:

- `false`: Reuse each valid, non-empty metadata field; ask only for missing or empty fields. An empty tags list triggers the optional tags prompt, but submitting it empty still permits promotion.
- `true`: Always ask for title and tags during promotion, prefilling existing values.

Read this setting from the capture's vault. It controls promotion only; explicitly choosing **Edit Metadata...** always opens both prompts. Do not add more settings for menu layout, icons, or confirmation.

## Implementation boundaries

- Contribute native `view/item/context` entries scoped to inbox captures, using regular groups rather than `inline`.
- Operate on the right-clicked item, not the active editor or another selection. Resolve its vault and validate that it is still an inbox capture before mutation.
- Reuse existing promotion, metadata, filename, and refresh helpers. Do not introduce a custom menu, webview, action framework, or separate state store.
- Require Workspace Trust for mutations and preview. Respect unsaved editor changes; never silently discard them.
- Refresh affected views and indexes after success. Report failures through existing error handling; do not add routine success notifications.
