---
status: Accepted
---

# ADR 007: Clickable document links

## Context

Users should navigate `[[stem]]` references without grep.

## Decision

Register a Markdown DocumentLinkProvider that resolves valid exact stems against the configured notes folder and opens the corresponding note.

## Consequences

Keep targets consistent with definitions, completions, and audit results. Unresolved references must remain auditable and must not navigate to a guessed target.
