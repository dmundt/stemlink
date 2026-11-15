---
status: Accepted
---

# ADR 010: Link completion

## Context
Typing exact stems by hand is error-prone.

## Decision
Offer completion after `[[` from indexed note stems using VS Code's completion UI.

## Consequences
Inserting a selection must yield a valid link without duplicated brackets. Completion must respect the configured vault and scale to 10,000 notes.
