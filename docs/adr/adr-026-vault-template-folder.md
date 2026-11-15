---
status: Accepted; superseded in part by ADRs 027 and 030
---

# ADR 026: Vault template folder

[ADR 027](adr-027-templates-folder-mapping.md) adds an optional templates-folder mapping while retaining the default layout and legacy fallback.

[ADR 030](adr-030-configurable-folder-settings.md) adds a templates folder setting and replaces the reserved literal name with distinct configured child-folder names.

## Context

Bundled templates currently appear beside permanent notes, where they look like notes and inflate the notes count. Users need an obvious place to edit examples for permanent notes, fleeting captures, and promotion.

## Decision

During Create Vault, copy `_template.md`, `_fleeting.md`, and `_promotion.md` into a vault-level `templates/` folder, separate from the configured inbox and notes folders. Reserve `templates` as a folder name so the example folder cannot collide with either configured destination. Preserve existing files and report conflicts. Do not install or move templates when opening an existing vault.

Add Fleeting Note reads `templates/_fleeting.md` first. If that path is missing, it falls back to the legacy `notes/_fleeting.md`; if both are missing, report both expected paths. If the preferred template exists but cannot be read, report its error rather than hiding it with a fallback. Existing template files are never moved or deleted.

Treat templates as examples, not enforced formats. New templates outside `notes/` do not appear in the Notes tree, backlinks, or notes count. Legacy underscore-prefixed Markdown files left in `notes/` retain their existing audit exclusion and remain visible in Notes and backlinks.

## Consequences

New vaults have a dedicated editable template folder. Existing vault layouts remain unchanged, and Add Fleeting Note continues to work with their legacy template. Notes counts for new vaults exclude template examples.
