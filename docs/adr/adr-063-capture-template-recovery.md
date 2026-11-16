---
status: Accepted
---

# ADR 063: One-time capture template recovery

## Context

Existing vaults can lack both the configured and legacy fleeting template. A missing template should not prevent capture without a recovery path.

## Decision

Keep configured-template and legacy-template precedence. When both files are missing, offer **Use bundled template once**. Acceptance reads the shipped template for this capture only; dismissal writes nothing. Other read errors remain errors.

Recheck Workspace Trust, vault registration, inbox mapping, and destination availability after prompts. Do not install templates or change configuration.

This supersedes the missing-template failure behavior in [ADR 016](adr-016-fleeting-note-command.md).

## Consequences

Existing customized templates remain authoritative. Recovery adds no command, setting, or persistent state.
