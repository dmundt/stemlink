---
status: Accepted
---

# ADR 038: Vault row icon

## Context

Vault rows need a recognizable container icon without custom assets or dependencies.

## Decision

Use VS Code's native `archive` ThemeIcon before every vault row. ThemeIcon uses VS Code's product icon system (Codicons by default), not a bundled Octicons library.

Retain native row selection as the active-vault indicator. The icon is identical for selected and unselected vaults and does not restore the checkmark removed by ADR 031.

## Consequences

The icon adapts to the selected product icon theme. Vault selection, labels, descriptions, tooltips, and commands remain unchanged.
