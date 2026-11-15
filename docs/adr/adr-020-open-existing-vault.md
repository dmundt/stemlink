---
status: Accepted
---

# ADR 020: Open an existing vault

## Context

Automatic discovery covers workspace roots and immediate children. Users also need to open other folders or mark an existing Zettelkasten without recreating its contents.

## Decision

Provide Open Vault in the command palette and tree title. Use the native folder picker. Preserve existing valid markers; report invalid markers without overwriting them. For a missing marker, ask for explicit confirmation, then let the user choose two distinct existing immediate child directories for captures and permanent notes. Write the version 1 marker without overwriting an existing file. Cancellation before writing leaves the folder unchanged.

Require Workspace Trust before marker creation or workspace changes. Reuse discovered workspace roots and children. Add folders outside discovery scope to the current workspace; open the chosen folder as the workspace if none is open. Select the opened vault after discovery, including after the empty-window transition.

Do not change legacy settings, copy templates, create note directories, or alter existing notes. This extends ADR 019 without changing discovery depth or marker format.

## Consequences

An existing folder can become a vault without moving notes. Added folders become part of the workspace and its normal save behavior. Vaults opened without templates still need user-provided templates for commands that require them. Confirmation may leave a marker behind if a later workspace operation fails; errors are reported.
