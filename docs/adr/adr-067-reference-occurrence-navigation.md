---
status: Accepted
---

# ADR 067: Reference occurrence navigation

## Context

Repeated inbound filenames do not identify their source occurrences. Missing outbound targets have no destination, leaving their source difficult to find.

## Decision

Keep inbound filenames and occurrence counts. Describe each occurrence with its one-based source line and a whitespace-normalized line excerpt capped at 80 characters. Include source path and line in its tooltip, retaining exact navigation offsets.

Missing outbound rows keep their warning and Missing description but open the source link through the existing `stemlink.openAt` command. Resolved links still open their target.

## Consequences

Reference navigation gains context without adding commands, menus, or automatic link repair.
