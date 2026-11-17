---
status: Accepted
---

# ADR 044: Fleeting router titles

## Context

Fleeting captures commonly have no YAML metadata. Missing-description placeholders do not help readers choose captures.

## Decision

Use File and Title columns in inbox routers. Skip YAML front matter and blank lines. Use the first body line, strip an ATX heading prefix, and stop at its first sentence-ending punctuation followed by whitespace or the line end. Limit titles to 120 Unicode code points and append ASCII `...` when truncated. Label empty captures `Empty capture.`. Report unclosed front matter through the existing router error path.

Keep permanent-note router descriptions unchanged. Preserve existing file links, table escaping, refresh behavior, and user-authored text outside generated sections.

This supersedes inbox description selection in [ADR 037](adr-037-file-description-routers.md).

## Consequences

Existing generated inbox routers update on refresh without note migration. Titles are navigation hints, not substitutes for reading captures.
