---
status: Accepted
---

# ADR 066: Portable inline vault creation validation

## Context

Late cross-folder errors force users to restart vault creation. Windows device basenames cannot be used portably, even when creation occurs on another platform.

## Decision

Validate creation inputs inside their native input boxes, keeping earlier answers while the current answer is corrected. Resolve the effective templates mapping after accepting the root and before asking for child folders. Reject collisions with templates and the previously chosen inbox before accepting each answer.

Reject reserved Windows device basenames, case-insensitively and including extension forms, for all newly created vault folder names on every platform. Keep existing-vault readers unchanged. Reject invalid template defaults before child prompts or writes and offer the existing Settings action.

Recheck Workspace Trust before creation writes. Preserve confirmation, no-overwrite, and rollback behavior.

## Consequences

New vault layouts are portable. Existing Linux vaults with device-like names still read and open without migration. No extra wizard step or configuration setting is added.
