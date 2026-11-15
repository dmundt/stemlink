---
status: Accepted
---

# ADR 011: Manual reference audit

## Context

Users want an explicit check, not automatic diagnostics.

## Decision

Provide Check References, scanning configured permanent notes and publishing clickable Problems for broken and malformed links, invalid filenames, missing title/tags YAML, missing outgoing links, and missing backlinks. Broken links are errors; missing backlinks are informational.

## Consequences

Replace prior audit results on each run and report completion or errors. Use the same link semantics as navigation and avoid treating code examples as links. Audit must account for open unsaved note content.
