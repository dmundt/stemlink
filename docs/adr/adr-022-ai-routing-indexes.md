---
status: Superseded by ADR 037
---

# ADR 022: AI routing indexes

[ADR 037](adr-037-file-description-routers.md) retains the ownership and navigation rules and replaces count-only folder routers with live file-description mappings.

## Context

AI agents opening a vault need a small, predictable starting point that directs them to captures and permanent notes. A complete filename listing would duplicate vault contents, grow with the vault, and become stale.

## Decision

Create `INDEX.md` at the vault root and in its configured inbox and notes folders when creating or explicitly opening a vault. Do not initialize indexes merely because a vault is discovered. Require Workspace Trust for all writes.

The generated sections provide concise, folder-specific instructions, include the configured folder names, and use relative links between the three indexes. The root and folder indexes report counts of direct-child Markdown files, excluding `INDEX.md` and `AGENTS.md`. New templates live outside the notes folder and are not counted. Legacy underscore-prefixed templates left in the notes folder remain visible and included in its count. Do not list every note or record an action history.

Create missing indexes without overwriting existing files. An unmarked, user-authored `INDEX.md` remains unchanged. Put Stemlink-owned content between generated-section markers and update only that section; preserve text outside it. User edits inside a marked section may be replaced during refresh.

After observing Markdown file creation, change, or deletion directly in the inbox or notes folder, debounce a count refresh for that vault. Write only when generated content changes, so INDEX.md events do not cause update loops. Do not recreate a deleted index on a file event; a later explicit create/open action installs missing indexes. If a configured subfolder is absent, skip its index and report the missing path without creating the folder.

## Consequences

The router files are navigation aids, not authoritative vault state or an index of note contents. Stemlink's in-memory note/reference index is authoritative for live extension state. Counts can briefly lag filesystem events and cannot promise to reflect changes an editor or filesystem watcher did not report, so agents must read Markdown files for note content. Existing user-authored index files do not receive Stemlink count updates.

Router and agent-instruction files are excluded from note targets, completion, backlinks, audit, capture listings, and their counts. No command, database, network call, or runtime dependency is added.
