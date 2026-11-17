---
status: Accepted
---

# ADR 071: Shared coverage gates

## Context

Stemlink and Prompteur use different coverage runners and test scopes. Their line,
branch, and function floors have diverged.

## Decision

Supersede only the coverage floors in [ADR 070](adr-070-repository-delivery.md).
Both projects enforce at least 95% lines, 91% branches, and 93% functions.
Prompteur retains its additional 91% statement gate. Stemlink measures emitted
extension modules with core and host tests; Prompteur measures source files with
unit tests. Neither runner's percentage is directly comparable to the other's.

## Consequences

Coverage remains in nightly and manual validation. Tests exercise behavior rather
than changing the measured scope to satisfy a threshold. Runner-specific gates
can remain stricter where their measurements support them.
