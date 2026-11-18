---
status: Accepted
---

# ADR 074: Read-only Copilot link lookup

## Context

Agents can read Markdown files, but cannot query Stemlink's live backlink index. A separate agent plugin or MCP server would duplicate indexing and miss unsaved changes.

## Decision

Contribute one native VS Code language model tool for exact note stems. Require Workspace Trust and VS Code confirmation, restrict queries to discovered vaults, and ask for an explicit vault choice when multiple vaults are available. Return bounded link occurrences with vault-relative paths, not note bodies or excerpts. Do not expose writes or package a separate agent plugin.

## Consequences

The minimum desktop VS Code version is 1.95, which provides the stable tool API. Local link navigation still works in Restricted Mode. Approved results may reflect unsaved edits. Tool discovery depends on the active agent session.
