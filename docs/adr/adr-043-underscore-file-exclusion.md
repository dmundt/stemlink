---
status: Accepted
---

# ADR 043: Underscore file exclusion

## Context

Underscore-prefixed files are supporting material, not captures or permanent notes. Previously they were excluded from the reference audit but remained visible and contributed backlinks.

## Decision

Exclude files whose names start with `_` from capture and permanent-note views, their counts, note indexes, completion, navigation targets, and backlinks. Exclude them as audit sources. Wiki links to these files remain malformed references under the existing filename-stem grammar and are reported by Check References.

Use the same exclusion predicate for initial indexing, filesystem events, document edits, and views. Reject promotion of underscore-prefixed captures. Preserve files and the legacy `_fleeting.md` template fallback. Folder routers continue to describe local Markdown files independently of the note index.

This supersedes the legacy visibility and backlink behavior in [ADR 015](adr-015-note-templates.md) and [ADR 026](adr-026-vault-template-folder.md).

## Consequences

Existing underscore-prefixed files disappear from note views and reference results without migration or deletion. Rename a file to a valid note filename to make it a permanent note.
