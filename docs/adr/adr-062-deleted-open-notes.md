---
status: Accepted
---

# ADR 062: Deleted open notes

## Context

A late file event can read a cached editor document after its file was deleted, restoring a nonexistent note to navigation and reference indexes. On the minimum supported host, low-level filesystem watchers also intermittently delivered no event for command deletion.

## Decision

Require file existence before asynchronous file reconciliation indexes a cached open document. Track known missing URIs in memory so later document events cannot restore them. Preserve synchronous updates for ordinary unsaved edits; clear the missing state only when file reconciliation or a successful refresh confirms recreation.

Keep deleted editor buffers intact, but exclude them from note and filename indexes until the file exists again. Once recreated, retain the established precedence of unsaved editor contents.

Use a native workspace file edit for confirmed deletion and listen for completed workspace deletions alongside filesystem events. This updates every affected vault instance without relying only on low-level watcher delivery. Native deletion honors VS Code's `files.enableTrash` preference; dirty-note protection and confirmation remain unchanged. Report unsuccessful edits explicitly.

## Consequences

Deletion and recreation use the same reconciliation for native commands and external changes. Cached-document indexing adds an existence check; unopened file reads and filename-only browsing retain their existing paths. Existing editor buffers are not discarded by indexing. No Markdown migration is required.
