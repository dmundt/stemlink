---
status: Accepted
---

# ADR 058: Capture batch feedback

## Context

Native multi-selection must mean the same thing for context-menu and drag promotion. Repeated editor opening obscures partial batch outcomes.

## Decision

Use one sequential, deduplicated batch path for selected captures. Keep source-vault targeting, default-on confirmation for each promotion, metadata prompts, concurrency checks, and stop-on-cancel/error behavior from ADR 050.

Use native progress and report completed versus not-fully-promoted captures. Open the last created permanent note once after a batch, including partial completion. If target creation succeeds but source cleanup fails, retain explicit error details and distinguish the partial creation from a completed promotion.

Keep metadata editing and discard single-item: disable these commands for native multi-selection and reject direct multi-selection invocation. Add no bulk delete, setting, shortcut, or menu item.

## Consequences

This extends ADR 050 and refines ADR 048 selection behavior. Single-capture workflows and Markdown compatibility remain unchanged.
