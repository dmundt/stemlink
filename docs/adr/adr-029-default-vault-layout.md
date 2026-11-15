---
status: Accepted
---

# ADR 029: Default vault layout

## Context

The former `zk/inbox/notes` defaults use an abbreviated root and a generic permanent-note folder name. The default layout should distinguish the complete note collection from captures, permanent notes, and editable examples.

## Decision

Partially supersede [ADR 002](adr-002-vault-creation.md) and [ADR 025](adr-025-configurable-feature-settings.md) for default folder names only.

Use `notes/` as the workspace-relative vault root, containing `templates/`, `inbox/`, and `permanent/`. Set `stemlink.root=notes`, `stemlink.inbox=inbox`, and `stemlink.notes=permanent`. Use the same defaults in creation prompts and settings-based path resolution. The `notes` configuration and marker keys still name the permanent-note directory; they are not renamed.

Keep all folder names configurable. Document these alternatives without automatically inferring their layout:

| Layout            | Vault root      | Captures    | Permanent notes |
| ----------------- | --------------- | ----------- | --------------- |
| Previous defaults | `zk/`           | `inbox/`    | `notes/`        |
| Ahrens-inspired   | `Zettelkasten/` | `Fleeting/` | `Permanent/`    |
| Capture labels    | `vault/`        | `capture/`  | `notes/`        |
| Lifecycle labels  | `vault/`        | `inbox/`    | `permanent/`    |

Use Open Vault to select existing folders and confirm marker creation, or configure the paths explicitly. Preserve existing markers, explicit setting values, Markdown files, and templates. Do not migrate, rename, or rewrite existing vaults. Marker/settings conflicts retain the existing confirmation and remembered-choice behavior; cancellation skips the conflicting vault.

## Consequences

New vaults separate captures, permanent notes, and examples beneath `notes/`. Generated manuals, routers, and optional agent instructions continue to use the chosen names.

This public-beta change affects implicit path defaults, not note metadata or marker version 1. Existing marked vaults and explicitly configured paths remain supported. Vaults relying on the old implicit defaults, including partially configured settings, may need Open Vault or explicit folder settings. No automatic legacy-layout discovery or migration is introduced.

Behavior tests cover the new default layout, configurable alternatives, and existing marker preservation. This change depends on the template mapping and generated-guidance features on `feat/vault-features-collector`.
