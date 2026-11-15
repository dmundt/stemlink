---
status: Accepted
---

# ADR 021: Vault-local .stemlink.json

## Context

Folder names such as `fleeting`, `stable`, `inbox`, and `notes` do not reliably identify a Zettelkasten or its purpose. Workspace settings alone do not travel with a vault. A workspace-level registry would need updates when vaults move and would tie recognition to one workspace.

We need an explicit, portable declaration of the vault root and its two note directories without adding a database or changing Markdown files.

## Decision

Use one `.stemlink.json` file directly inside each vault root, such as `zk/.stemlink.json`. The containing directory is the vault root; no separate root path is stored.

```text
zk/
  .stemlink.json
  fleeting/
  stable/
```

```json
{
  "version": 1,
  "inbox": "fleeting",
  "notes": "stable"
}
```

- `version` identifies the configuration format; currently only numeric `1` is supported.
- `inbox` names the directory for unprocessed captures.
- `notes` names the directory for permanent notes and optional templates.

Both directory values are single names relative to the marker, not absolute paths or nested paths. They must be nonempty, distinct ignoring case, and valid under Stemlink's folder-name validation. Path traversal, separators, leading or trailing whitespace, and trailing dots are rejected.

The marker declares intent, not an index or proof of valid note content. It contains no note text, links, cached counts, or active-vault selection. Selection remains workspace-local as defined in [ADR 019](adr-019-multiple-vaults.md).

Discover markers in workspace roots and immediate child directories. Use [Open Vault](adr-020-open-existing-vault.md) for other locations. Marker creation for an existing folder requires confirmation and Workspace Trust; it does not replace an existing marker or install templates. New vault creation writes the marker automatically.

Retain settings-only vault compatibility. When explicit settings conflict with a marker for the same root, ask which configuration to use rather than silently overriding either. Report invalid or unreadable markers. Watch marker creation, edits, and deletion to refresh discovery.

This records the marker contract retained from [ADR 018](adr-018-vault-marker-discovery.md); discovery and opening behavior remain governed by ADRs 019 and 020.

## Alternatives considered

- **Infer intent from directory names:** ambiguous and incompatible with custom layouts.
- **VS Code settings only:** tied to editor/workspace configuration rather than the vault.
- **Workspace-level `.zk` registry:** separates configuration from notes and requires maintaining paths when vaults move.
- **Vault-local `.zk/config.json`:** adds a directory and a generic filename for one small configuration file.

The extension-specific `.stemlink.json` name makes ownership explicit and keeps configuration beside the notes without an extra directory.

## Consequences

Copying or moving the entire vault preserves its configuration. Renaming either note directory requires updating the marker. The marker can be version-controlled with the vault; Markdown notes remain usable without Stemlink.

Existing users need no migration to continue using settings-only vaults. Adding a marker opts a folder into portable recognition without rewriting note metadata. Future incompatible marker formats require an explicit version change and compatibility or migration decision.
