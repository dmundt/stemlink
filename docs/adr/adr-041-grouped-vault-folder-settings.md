---
status: Accepted
---

# ADR 041: Grouped vault folder settings

## Context

The four settings that define a vault layout appear separately from each other in the Settings UI.

## Decision

Contribute `stemlink.root`, `stemlink.inbox`, `stemlink.notes`, and `stemlink.templates` together under a **Vault Folders** configuration category. Keep other settings under **Features**. Preserve all setting keys, defaults, scopes, and behavior.

## Consequences

The Settings UI groups folder-layout choices together without changing configuration compatibility.
