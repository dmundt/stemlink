---
status: Accepted
---

# ADR 068: Tag problem locations and empty picker guidance

## Context

Tag Problems previously pointed at the first character regardless of the invalid YAML location. An empty native tag picker did not explain how to supply tags.

## Decision

Return optional source offsets from the VS Code-independent tag parser. Locate parser errors, invalid tag keys, non-mapping front matter, and unclosed delimiters where available. Account for the opening delimiter, BOM, and line endings. Use a safe file-level fallback when no location is available.

Convert offsets through a shared native position helper used by tag diagnostics and manual validation. Keep lazy parsing, cached summaries, warning bounds, and diagnostic ownership unchanged.

When the picker has no choices, its placeholder explains YAML tags with `tags: [idea]`. Native search and selection behavior remain unchanged.

## Consequences

Users can navigate to invalid metadata without extra reads or UI surfaces. This refines the diagnostic location policy of [ADR 059](adr-059-tag-problem-feedback.md).
