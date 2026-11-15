---
status: Accepted
---

# ADR 006: Promote Capture

## Context

Users need to turn an inbox capture into a permanent note without losing its contents.

## Decision

Provide an explicit Promote Capture action from the tree. Prompt for title and optional tags, create the permanent note with valid front matter and preserved capture body, and remove the original only after successful creation.

## Consequences

Cancellation or write failure leaves the capture intact. Handle existing front matter without silently discarding content; never overwrite a target file.
