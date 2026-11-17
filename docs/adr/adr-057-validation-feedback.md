---
status: Accepted
---

# ADR 057: Validation feedback

## Context

Clearing diagnostics before refresh loses useful previous results if validation fails. Completion must identify the checked vault and provide native navigation to its findings.

## Decision

Prepare the complete diagnostic replacement after successful refresh and audit, then replace manual Stemlink validation results globally. Failed refresh or unavailable vault leaves previous results intact. This refines ADRs 011 and 051 without changing their successful-run replacement scope.

Include vault identity, permanent-note scope, counts, and replacement semantics in completion feedback. Offer Show Problems through the existing notification and native Problems command, not another contributed command or menu.

## Consequences

Validation remains read-only and includes unsaved contents. Other diagnostic collections, including tag metadata diagnostics, are untouched.
