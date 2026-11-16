---
status: Accepted
---

# ADR 064: Vault scope and filtered creation feedback

## Context

Configured folder headings do not identify their vault. Notes created outside the active tag filter can appear to be missing.

## Decision

Show the selected vault in existing Fleeting, Notes, and References descriptions. Combine Notes' vault label with its active tags. Disambiguate repeated vault names using workspace names, or workspace paths when those names also collide. Keep configured headings unchanged.

Name the capture destination in the headline prompt. After creating a permanent note in the displayed vault, explain when its active tag filter hides the note and offer the existing **Clear tag filter** action. Keep the filter until explicitly cleared. Apply the same feedback to single promotion and the last note opened by batch promotion.

## Consequences

Scope is visible without additional UI surfaces or automatic selection changes. Matching notes and creation in other vaults produce no filter notice.
