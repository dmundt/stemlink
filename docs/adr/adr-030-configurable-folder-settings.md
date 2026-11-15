---
status: Accepted
---

# ADR 030: Configurable folder settings

## Context

Root, capture, and permanent-note folders have VS Code settings, but creation prompts ignore them. Editable templates have a portable marker mapping but no corresponding setting.

## Decision

Provide four resource-scoped folder settings:

| Setting              | Default     |
| -------------------- | ----------- |
| `stemlink.root`      | `notes`     |
| `stemlink.inbox`     | `inbox`     |
| `stemlink.notes`     | `permanent` |
| `stemlink.templates` | `templates` |

Keep the three creation prompts for root, capture, and permanent notes. Prefill them from the effective settings. Read the templates name from settings without adding another prompt. Save all four chosen values at the existing workspace or workspace-folder scope and include the templates name in new markers.

Validate every name as a single folder name. Capture, permanent-note, and template directories must be distinct ignoring case. No literal name such as `templates` is reserved when the template directory has another name.

Settings-only vaults use all four settings. Adding a marker through Open Vault uses the configured templates name without installing templates. Existing markers remain unchanged: absent `templates` still means `templates`, regardless of VS Code defaults.

When resolving a same-root marker/settings conflict, retain the marker's template path if `stemlink.templates` is unset. If it is explicitly set at user, workspace, or workspace-folder scope, include it in the existing configuration chooser. Show all three child paths, remember the choice until the candidates change, and skip the conflicting vault on cancellation. Choosing settings changes the effective paths, not the marker or settings files.

Creation preserves an existing marker. If its mappings differ from the requested paths, reject reuse rather than overwrite it. Files and folders are never migrated or renamed automatically. Existing template lookup, manual rendering, routers, and agent instructions consume the resolved paths.

This partially supersedes [ADR 002](adr-002-vault-creation.md) for prompt defaults, [ADR 025](adr-025-configurable-feature-settings.md) for the path-settings list, [ADR 026](adr-026-vault-template-folder.md) for the reserved template name, and [ADR 027](adr-027-templates-folder-mapping.md) for settings/marker template precedence. [ADR 029](adr-029-default-vault-layout.md) still defines the default layout.

## Consequences

Users can configure the entire layout through VS Code settings or portable vault mappings. Changing a setting selects paths; it does not move content. Marker version 1 and existing explicit mappings remain compatible without migration. Custom template locations require an extension version supporting them.
