---
status: Accepted
---

# ADR 072: Layered extension architecture

## Context

Stemlink and Prompteur share contributor workflows but organize extension code
differently. Stemlink must retain its native UI, Markdown formats, and existing
vault behavior while making its dependencies easier to understand.

## Decision

Organize Stemlink source into core, application, platform, and workbench layers.
Core and application remain independent of VS Code. Platform integrates vault
storage and documents with the application index. Workbench supplies native
views, commands, providers, discovery, and extension activation.

## Consequences

The extension entry point and user-visible behavior remain unchanged. Tests and
packaging must include nested modules. Additional ports should be introduced
only where they enable a concrete separation or test.
