---
status: Accepted
---

# ADR 008: Go to Definition

## Context
Keyboard navigation should use standard VS Code interactions.

## Decision
Register a Markdown DefinitionProvider so F12 on a `[[stem]]` opens the exactly matching note.

## Consequences
Use the same parsing and resolution rules as document links. Missing targets must not resolve to unrelated files.
