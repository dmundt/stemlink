---
status: Accepted
---

# ADR 001: Minimal extension

## Context

Stemlink supports a plain-file Zettelkasten, not a feature-heavy note platform.

## Decision

Follow VS Code extension best practices and use the provided VS Code APIs. Use runtime built-ins and existing project dependencies only; do not add libraries. Keep the extension minimal, boring, and simple, with discoverable actions. No graph, database, automatic diagnostics, or decorative UI.

## Consequences

The vault remains usable without the extension. VS Code conventions constrain interaction and supported behavior.
