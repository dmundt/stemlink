---
status: Accepted
---

# ADR 050: Drag promotion and confirmation

## Context

Captures should support native drag promotion without bypassing metadata or source-retention safeguards. Users also need explicit consent before promotion, regardless of entry point.

## Decision

Use native tree drag-and-drop controllers: Fleeting supports multi-selection and emits an internal capture payload; Notes accepts that exact in-memory payload on its background or permanent-note rows. Do not accept OS files, Explorer URI drops, or external payloads. Validate captures at execution time and deduplicate them in drag order.

Promote sequentially into each source vault's permanent-note folder, regardless of the displayed vault or drop row. Never modify a drop row. Reuse a single promotion function for the context command and drops, retaining trust, metadata, collision, save, concurrency, and index protections.

Add resource-scoped `stemlink.confirmPromotion`, default true, under Capture settings. Before metadata prompts or writes, ask for each capture individually, naming its filename and destination. Read the setting from its source vault. This is separate from `stemlink.promptForPromotionMetadata`; disabling confirmation does not skip metadata validation.

Stop a batch on cancellation or first error. Keep completed promotions and retain unprocessed captures; do not roll back earlier items. Observe cancellation between prompts/items and before writes. Prevent overlapping drops and duplicate promotion of a capture. Once target creation starts, finish the guarded operation to avoid interruption halfway through source removal.

Add no commands, menus, icons, toolbar buttons, shortcuts, dependencies, or routine success popups.

## Consequences

This supersedes only ADR 048's context-menu-only promotion boundary. New default confirmation adds one prompt per capture; users may disable it. Existing Markdown and metadata remain compatible without migration. A batch can partially complete, and a drop into a different displayed vault still uses source-vault destinations.
