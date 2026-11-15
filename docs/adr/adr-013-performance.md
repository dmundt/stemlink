---
status: Accepted
---

# ADR 013: Performance at 10,000 notes

## Context

The extension should remain practical with 10,000 notes, without refusing larger vaults.

## Decision

Benchmark a representative 10,000-note fixture. Measure initial indexing, tree rendering/refresh, completion, backlinks, and manual audit; record fixture assumptions, environment, and observed timings. Optimize measured bottlenecks.

## Consequences

No hard capacity cap or unapproved latency threshold. Use targeted, incremental, or lazy work where appropriate, while keeping state accurate and errors visible.

## Benchmark observation

On Windows 11 (build 26200), an Intel i7-13800H, VS Code 1.146.0, and Node 24.22.1, the VS Code host benchmark used 10,000 newly created, small Markdown files, each with YAML title and tags and one outgoing reference. In one run:

- The first document-link request took 4.2 seconds.
- The first full backlink index took 59.5 seconds; a second index over the same files took 0.85 seconds.
- Generating Notes tree items took 16 ms; generating them again took 2 ms. This measures provider work, not actual rendering.
- Completion took 0.60 seconds; VS Code's native reference request after indexing took 1.57 seconds; a subsequent manual audit took 1.73 seconds.

These are observations, not guarantees. Cold full-vault scans remain slow on this system. Stemlink keeps filename lookup separate from content indexing, shows indexing in the status bar, and updates in-memory references on changes. Use Ref To or Find All References after indexing completes; no hard note-count limit is enforced.

In a later run on the same environment and fixture, the first full index took 61.5 seconds; an independent warm index took 0.79 seconds. The test verified all 10,000 notes and their expected backlinks. Notes tree provider work took 17 ms, completion 0.33 seconds, native references 1.01 seconds, and manual audit 1.44 seconds. These timings are observations, not thresholds.
