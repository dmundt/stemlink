---
status: Accepted
---

# ADR 059: Tag problem feedback

## Context

Listing every malformed note in a notification does not scale. Users need navigable metadata errors without losing manual audit results.

## Decision

Replace ADR 052's all-files notification with a bounded count/vault summary and Show Problems action. Store file-level warnings in a separate Stemlink tags diagnostic collection. Notify when a newly affected note appears, not whenever the same malformed content changes.

Reuse indexed note snapshots and the existing parser cache. Once tags have been inspected, update known diagnostics from existing index events without new filesystem reads or watchers. Remove obsolete entries on correction, deletion, vault removal/remapping, and disposal. Keep manual validation diagnostics independent.

## Consequences

Invalid notes remain visible unfiltered and do not match selected tags. Unfiltered filename browsing and native picker search remain unchanged. No format migration or new UI surface is required.
