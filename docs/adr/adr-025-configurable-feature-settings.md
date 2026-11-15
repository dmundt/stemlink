---
status: Accepted; superseded in part by ADRs 029 and 030
---

# ADR 025: Configurable feature settings

[ADR 029](adr-029-default-vault-layout.md) replaces only the path defaults with `stemlink.root=notes`, `stemlink.inbox=inbox`, and `stemlink.notes=permanent`.

[ADR 030](adr-030-configurable-folder-settings.md) adds `stemlink.templates` and defines configured creation defaults and template mapping precedence.

## Context

Vault folder names are configurable, but router automation and agent-instruction prompts have fixed behavior. Users need per-workspace-folder control without changing Stemlink's portable note format or core navigation behavior.

## Decision

Keep the existing resource-scoped path settings and defaults: `stemlink.root=zk`, `stemlink.inbox=inbox`, and `stemlink.notes=notes`.

Add resource-scoped boolean settings:

- `stemlink.enableRouterIndexes`, default `true`: create or initialize `INDEX.md` routers during explicit Create/Open operations and refresh their generated sections after observed Markdown changes. When disabled, skip initialization and stop router watchers; never delete or modify existing router files. Re-enabling resumes watching and initializes files on the next explicit Create/Open.
- `stemlink.offerAgentInstructions`, default `true`: ask whether to add missing `AGENTS.md` files during Create/Open. When disabled, do not prompt or install files. Existing instruction files are never changed by this setting.

Do not add settings for timestamped permanent-note filenames, link semantics, manual reference audits, or tree/count behavior. These are core format and interaction contracts.

## Consequences

Defaults preserve existing behavior. Resource scope allows settings to vary by workspace folder in multi-root workspaces. Disabling either feature is non-destructive; existing files remain available and user-editable.
