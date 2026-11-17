---
status: Accepted
---

# ADR 065: Actionable configuration recovery

## Context

Discovery failures can look like first-run emptiness. Configuration errors lack direct repair, while unrelated preferences unnecessarily trigger discovery and repeat setup feedback.

## Decision

Carry known repair targets in typed configuration errors. Offer **Open configuration** for marker failures and the existing **Settings** action for invalid or missing configured paths. Report repair-action failures through normal error feedback. Do not infer repair targets from error strings.

Track discovery failure only in memory and through a context key. When no vault remains, replace first-run welcome content with recovery guidance using existing Settings and Refresh actions. Preserve healthy marker vaults when another marker or legacy configuration fails; clear failure state after successful discovery.

Rediscover only for the four folder settings, markers, or workspace folders. Synchronize router enablement directly. Display, capture, and instruction preferences do not rediscover vaults.

## Consequences

Restricted Mode repair navigation stays read-only. No command, menu, setting, dependency, or persisted error state is added.
