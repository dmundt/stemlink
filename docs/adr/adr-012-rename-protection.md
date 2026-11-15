---
status: Accepted
---

# ADR 012: Rename protection

## Context

Renaming a permanent note can break links, but VS Code's public rename event does not reliably veto Explorer or external renames.

## Decision

Block permanent-note renames initiated by Stemlink's own actions. Warn when VS Code reports a permanent-note rename; do not claim external renames are blocked.

## Consequences

External tools and some filesystem operations may bypass VS Code rename events. Users can run the manual reference audit after a rename. Do not promise automatic link rewriting.
