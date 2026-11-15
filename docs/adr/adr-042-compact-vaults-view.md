---
status: Accepted
---

# ADR 042: Compact Vaults view

## Context

The Vaults section competes with note and reference views for sidebar space, especially in workspaces with few vaults.

## Decision

Set the Vaults view's contributed `initialSize` to 100 pixels. Let VS Code's native tree scrolling handle lists exceeding available height. Do not resize views through internal workbench commands or APIs.

## Consequences

New view layouts start compact and large vault lists remain accessible through native scrolling. VS Code remembers user-adjusted view sizes, and the extension cannot dynamically resize a view as the vault count changes. Existing saved layouts may therefore retain their current size; users can resize the view through the workbench.
