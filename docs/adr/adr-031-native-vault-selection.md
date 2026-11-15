---
status: Accepted
---

# ADR 031: Native vault selection

## Context

Vault rows use both a checkmark and a `Selected` description to identify the active vault. These duplicate the workbench's native selection affordance. A workspace with several vaults also requires an initial manual selection even when no previous choice exists.

## Decision

Remove the vault-row checkmark and `Selected` description. Keep workspace names as row descriptions and full root paths as tooltips. Use native single-row selection in the Vaults view to identify the active vault.

Restore the last available selected vault from workspace state. If there is no available selection, select the first listed vault, including when there is only one. Explicit Create/Open selects its target. If the selected vault disappears, select the first remaining vault. Persist the resulting selection.

Native row selection and the Select Vault command both change the active vault. Editor changes, refreshes, and discovering additional vaults do not replace an available selection. Retain stable vault-row identities and synchronize the native selection after tree refreshes and when the view becomes visible, without moving focus or opening a hidden view.

Keep the existing note-navigation behavior: links resolve against their note's vault without changing the selected vault. Marker/settings conflict cancellation still skips the conflicting vault.

This supersedes [ADR 019](adr-019-multiple-vaults.md) for initial multi-vault selection and extends the native view presentation in [ADR 023](adr-023-separated-tree-views.md).

## Consequences

Every nonempty discovered vault list has an active vault without requiring an initial click. The active row remains identifiable through native workbench selection rather than extra text or icons. Counts, note actions, and references continue to use the selected vault.

Host tests verify native row selection, first and sole-vault fallback, editor and refresh persistence, selected-vault removal, and rediscovery without selection replacement.
