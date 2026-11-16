---
status: Accepted
---

# ADR 049: Permanent-note context actions

## Context

Permanent notes need metadata editing and deletion without duplicating editor functionality or adding visual clutter. Their stable filenames are wiki-link targets, so deletion can break references.

## Decision

Add text-only Edit Metadata... and Delete... actions to native Notes tree item context menus, with Delete in a separate group. Hide both from the Command Palette; add no inline buttons, toolbar actions, shortcuts, icons, new settings, or runtime dependencies.

Use the right-clicked note's vault, validate an eligible direct-child Markdown file, and require Workspace Trust. Reuse capture metadata prompts and serialization: preserve filename, body, unrelated YAML, and unsaved content; reject invalid metadata and intervening edits. Cancellation changes nothing.

Delete uses a native modal warning naming the note and warning that inbound wiki links may break. Require explicit confirmation; refuse dirty documents, revalidate and detect changes after prompting, and request trash deletion. Report failures without a permanent-deletion fallback. Do not count backlinks or rewrite references.

Reuse existing filesystem/index notifications and tree refreshes. Do not introduce routine success notifications.

## Consequences

Deleting a note may leave broken links; Check References can identify them. Editing a title does not rename its file. Existing notes need no migration, and existing capture actions retain their behavior.
