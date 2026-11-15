---
status: Accepted
---

# ADR 023: Separate native tree views

## Context

The Vaults, Fleeting, Notes, and References sections need clear visual separation. A single VS Code tree provider cannot draw horizontal rules between its root items. Contributed views in one container use the workbench's native separators and match the Source Control layout.

## Decision

Show Vaults, Fleeting, Notes, and References as separate tree views in the Stemlink container. Keep their counts in the view titles and preserve the existing section contents and selection behavior. References continues to contain Inbound and Outbound. Use one shared tree model and section-specific providers so indexing and counts remain consistent.

Place vault creation/opening and refresh actions in Vaults, note creation in Notes, and capture creation in Fleeting. Keep promotion on capture items.

## Consequences

The workbench draws separators between independently collapsible views. Each view has its own heading and can be collapsed separately. The single-tree presentation decision in ADR 019 is superseded; vault discovery, selection, note navigation, and reference semantics are unchanged.
