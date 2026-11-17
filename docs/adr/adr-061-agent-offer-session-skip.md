---
status: Accepted
---

# ADR 061: Agent offer session Skip

## Context

Repeated Open Vault actions should not repeatedly ask about optional files after the user explicitly skips them.

## Decision

Remember explicit Skip by vault root URI in the extension's existing instruction-offer service for the current session. Another vault remains independent, and extension restart resets this in-memory choice. Dismissal is not Skip or consent.

Retain the existing resource-scoped offerAgentInstructions setting as permanent opt-out. Keep trust guards, explicit Add consent, preservation of existing files, and no creation of missing configured folders. Add no setting or persistent file.

## Consequences

This supersedes ADR 024's repeated-offer behavior after explicit Skip. Existing instructions, Markdown format, and configuration remain compatible.
