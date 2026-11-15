---
status: Proposed
---

# ADR 014: Initial lazy indexing

## Context

Filename lookup is already lazy, but the first backlink request reads every permanent note. A cold 10,000-note scan took about one minute in the benchmark described in ADR 013.

## Decision

- Warm an in-memory content and reference index in the background for each existing configured vault after VS Code startup.
- If Stemlink activates earlier, schedule the same work asynchronously after activation; VS Code does not expose a public startup-finished callback to an already active extension.
- Keep filename lookup, link navigation, and completion independent of the content scan. Limit background work so it does not block the editor.
- Backlink requests wait for a complete, current index; do not present partial results as complete. Show indexing progress.
- Apply note changes, deletions, and unsaved edits that occur during scanning before publishing results.
- Report scan failures and retry on the next backlink or audit request. Do not silently return incomplete results.
- Keep the index in memory only. Do not change vault files or impose a note-count limit.

## Consequences

The first backlink request may still wait if the background scan is incomplete. Each extension session rereads note content, and startup work consumes I/O and memory. Explicit refresh and manual audit must continue to produce current results.
