---
status: Superseded in part by ADRs 050, 060, and 069
---

# ADR 048: Capture context actions

## Context

Inbox captures need metadata editing, promotion, and safe disposal without duplicating editor functionality or adding visual clutter. The previous promotion action always prompted and used the selected vault or active editor.

## Decision

Expose three text-only native `view/item/context` actions on inbox captures: Edit Metadata..., Promote to Note..., and Discard.... Separate Discard into its own group. Hide these commands from the Command Palette, remove the inline promotion icon, and add no toolbar buttons, shortcuts, custom UI, or runtime dependencies.

Resolve the item's URI and vault, not the active editor or selected vault. Validate a direct-child Markdown capture, excluding supporting files, before mutation. Require Workspace Trust.

Edit Metadata requests title and optional comma-separated tags using prefilled native input boxes. Cancellation applies no partial edits. Reuse existing YAML serialization, preserve the body and unrelated fields, and reject malformed YAML and invalid title/tag types. Retain unsaved body content and detect intervening document/filesystem changes.

Promotion reuses each valid non-empty field independently and prompts only for missing or empty fields. Resource-scoped `stemlink.promptForPromotionMetadata`, default false, forces both prefilled prompts when enabled. An empty tags list triggers the optional prompt; submitting empty remains valid. Use the capture's vault setting. Retain collision-safe filenames, successful target save before source removal, and source retention/error reporting if removal fails.

Discard uses a native modal warning naming the capture and requires explicit confirmation. Request trash deletion through the VS Code filesystem API; report unsupported or failed deletion rather than silently retry permanently. Refuse dirty captures, revalidate after confirmation, and retain files changed while the warning was open.

Reuse existing tree/index notifications and error reporting. Do not emit routine success notifications.

## Consequences

This changes pre-1.0 command discoverability: promotion is no longer an inline icon or Command Palette action and requires a capture item argument. Existing Markdown format remains compatible and no migration is needed. Native editor, link completion, preview, and Explorer continue to handle editing, linking, viewing, and renaming.

[ADR 050](adr-050-drag-promotion-confirmation.md) adds drag promotion alongside the context menu and default-on confirmation for every promotion.
