---
status: Superseded in part by ADR 053
---

# ADR 042: Compact Vaults view

## Context

The Vaults section competes with note and reference views for sidebar space, especially in workspaces with few vaults.

## Decision

Set the Vaults view's contributed `initialSize` to relative weight 100. This contribution behaves like CSS flex; the original description of 100 pixels was incorrect. Let VS Code's native tree scrolling handle lists exceeding available height. Do not resize views through internal workbench commands or APIs.

[ADR 053](adr-053-native-vaults-sizing.md) replaces the initial weight with 1 and clarifies the supported sizing limits. The prohibition on internal sizing APIs remains.

## Consequences

The initial weight requests a relative allocation, not a fixed compact height or row count. Large vault lists remain accessible through native scrolling. VS Code remembers user-adjusted view sizes, and the extension cannot dynamically resize a view as the vault count changes. Existing saved layouts may therefore retain their current size; users can resize the view through the workbench.
