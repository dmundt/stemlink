---
status: Accepted
---

# ADR 052: Notes tag filter

## Context

Users need to narrow the existing Notes tree by YAML tags without a separate Tags view, query language, or tag-management UI. Filtering must not change note files, navigation, or audit results.

## Decision

Add **Filter by tags…** and conditional **Clear tag filter** to the Notes view menu only. Use text-only menu actions, not toolbar buttons, shortcuts, settings, or visible Command Palette entries.

Use a native multi-select Quick Pick with one stable item list and native search. List canonical tags alphabetically with counts across all eligible permanent notes in the selected vault. Prefill checked tags. Search keeps hidden checked items selected; Enter applies the complete checked set, while Escape keeps the prior filter. Keep choices stable while the picker is open. Cancel a picker if its vault is switched, removed, or remapped.

Match any selected tag; an empty selection shows all original notes. Trim surrounding whitespace, lowercase tag keys, ignore blanks, and count equivalent tags once per note. Do not remove `#`, infer tag hierarchies, validate titles, or rewrite metadata. Keep selected tags with no remaining notes active and present in the picker with count 0.

Store filters separately for each registered vault in memory only. Restore each filter when switching vaults, and discard it when the vault is removed or the extension session ends. Show active tags in the Notes view description. While filtering, use the matching count in the heading, respecting `stemlink.showCounts`.

Reuse the existing complete note index and its change events, including unsaved edits. Derive and cache tag metadata by note snapshot identity; invalidate aggregate summaries on index changes. Leave unfiltered Notes on its existing filename-only path. Do not add filesystem scans, watchers, persistent indexes, or reads during picker search. Preserve note row ordering, opening, context actions, and the underlying index.

Missing front matter/tags and empty tag lists are untagged. Report invalid YAML, non-mapping front matter, and non-string-list tags in an aggregated native notification identifying affected notes. Suppress repeated notifications for unchanged problems. Invalid notes do not match tags but remain visible unfiltered. Keep indexing/read errors explicit and separate from zero matches. Do not replace manual audit diagnostics.

Filtering, searching, and clearing require no Workspace Trust because they do not write files, settings, metadata, routers, or documents.

## Consequences

Opening the picker or filtering waits for the full in-memory content index; unfiltered filename browsing remains independent. Counts and matches update on metadata edits, creation, promotion, deletion, and refresh. A filter may legitimately show zero notes. Session-only state requires no migration, and existing Markdown remains unchanged.
