---
status: Accepted
---

# ADR 005: Add Note

## Context

Users need a direct way to create a permanent note.

## Decision

Add a tree-accessible Add Note command that prompts for title and optional tags, generates a timestamp-slug filename, and creates a Markdown file with valid YAML front matter in the configured notes folder.

## Consequences

Cancellation does not create a file. Detect collisions and errors without overwriting existing notes; open the newly created note.
