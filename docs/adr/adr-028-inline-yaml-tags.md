---
status: Accepted
---

# ADR 028: Inline YAML tags

## Context

Block-style YAML tag lists take multiple lines for a small amount of metadata. Vault examples already use the shorter inline form, but note creation and promotion default to block lists.

## Decision

Use a single-line YAML flow sequence for `tags` in every vault Markdown file written with generated metadata, such as `tags: [notes, zk, bug]`. Empty lists remain `tags: []`. Use the existing YAML serializer for safe quoting and disable line wrapping.

Apply the same serialization to Add Note and Promote Capture, including captures with existing block-style tags. Preserve unrelated metadata values and note bodies. Document the convention in the vault manual and agent instructions; bundled examples already follow it.

## Consequences

Generated notes match the concise vault convention. Existing block-style lists remain readable and valid; do not bulk-rewrite existing user files on discovery or opening. This refines the representation of tags in [ADR 003](adr-003-note-format.md) without changing their meaning.
