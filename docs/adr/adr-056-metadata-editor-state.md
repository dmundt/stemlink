---
status: Accepted
---

# ADR 056: Metadata editor state

## Context

Editing metadata must not silently save unrelated unfinished body edits. Generic prompts hide which file or vault an action targets.

## Decision

Preserve the document's initial dirty state during metadata editing. Apply metadata through the existing WorkspaceEdit and concurrency checks. Save originally clean documents; leave originally dirty documents unsaved with body and metadata edits retained. Existing index events continue to reflect unsaved content.

Creation, metadata, and promotion prompts identify their action and target without adding steps. Keep prefilled values and cancellation without partial edits.

## Consequences

This clarifies ADRs 048 and 049: preserving unsaved body content also preserves user control over saving it. Command IDs and Markdown format remain unchanged.
