---
status: Accepted
---

# ADR 045: AI Context settings

## Context

The Features settings group mixes sidebar display preferences with files that provide context to external AI tools.

## Decision

Keep Vault Folders first. Put `stemlink.showCounts` under Display. Put `stemlink.enableRouterIndexes` and `stemlink.offerAgentInstructions` under AI Context.

Keep setting identifiers, defaults, scopes, and runtime behavior unchanged. The heading describes local context preparation, not built-in AI or provider integration.

## Consequences

Existing workspace settings remain compatible. Users can find display preferences separately from AI context controls.
