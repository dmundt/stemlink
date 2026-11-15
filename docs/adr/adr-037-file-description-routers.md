---
status: Accepted
---

# ADR 037: File-description routers

## Context

Folder routers with only counts and parent links do not help readers select relevant captures or notes.

## Decision

Keep the root `INDEX.md` compact and route to configured folder indexes. Add a sorted mapping of direct-child Markdown filenames to descriptions in each inbox and notes router, with relative file links. Read YAML `description`, falling back to `title`; label absent metadata explicitly. Report invalid front matter and label its entry rather than dropping the file. Escape Markdown table content and encode file links.

Require Workspace Trust and honor `stemlink.enableRouterIndexes`. Create missing routers only during explicit Create/Open. Refresh existing generated routers when discovered, after observed file creation, edits, renames, deletion, document opening or closing, and explicit Refresh. Use open document content, including unsaved metadata. Debounce automatic refreshes, coalesce events during a refresh into one follow-up, and serialize updates per vault. Do not scan note contents on discovery when no generated router exists.

Preserve unmarked user-authored routers and text outside generated sections. Retain configured-folder instructions, parent and sibling navigation, counts, and exclusions for `INDEX.md` and `AGENTS.md`. Routers remain navigation aids; readers must open relevant notes for their content.

## Consequences

This supersedes ADR 022. Existing generated sections upgrade without changing note formats or user-authored text. Listings grow with folder size and refreshing requires reading file metadata. Missing descriptions do not require migrating captures or notes. Generated routers can reflect unsaved metadata and update again on revert. Watcher delivery and debounce mean refreshes are eventual, not instantaneous; explicit Refresh reconciles missed events.
