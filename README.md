# Stemlink

[![Local Extension Quality](https://github.com/dmundt/stemlink/actions/workflows/quality.yml/badge.svg)](https://github.com/dmundt/stemlink/actions/workflows/quality.yml)

Build a Zettelkasten like vault in VS Code with plain Markdown files. Capture ideas, connect notes, and find backlinks without a database or account. Your notes remain usable without Stemlink.

## Get started

1. Open a workspace folder and the **Stemlink** activity bar view.
2. Run **Stemlink: Create Vault**. Accept `notes/` containing `templates/`, `inbox/`, and `permanent/`, or choose your own names.
3. Stemlink restores the last available vault or selects the first listed vault. Choose another under **Vaults** when needed. Use **Add Fleeting Note**, **Add Note**, or **Promote Capture to Note**.

The Activity Bar badge shows the number of discovered vaults in the workspace; it is hidden when there are none. It remains visible when `stemlink.showCounts` hides view counts.

The default root holds the collection; `inbox/` holds captures, `permanent/` holds permanent notes, and `templates/` holds editable examples. The bundled manual lists alternatives: `zk/inbox/notes`, `Zettelkasten/Fleeting/Permanent`, `vault/capture/notes`, and `vault/inbox/permanent`. Use Open Vault or settings for these layouts; Stemlink does not infer a layout from its folder names.

Vault creation copies the bundled manual to the vault root and personalizes its folder summary with your chosen names. Editable Markdown examples go into the mapped templates folder (`templates/` by default). `INDEX.md` routers and accepted `AGENTS.md` instructions also include configured folder names; existing files are preserved. Routers are navigation-only, not authoritative; Stemlink's in-memory note/reference index is authoritative for live state. Stemlink updates only generated index sections with current Markdown counts as files change. Promotion preserves the capture's content; rewrite it as needed.

Add Fleeting Note reads `_fleeting.md` from the mapped templates folder first and falls back to the configured notes folder for existing vaults.

Create Vault and Open Vault also ask before adding minimal `AGENTS.md` instructions to the vault root, inbox, and notes folders. Existing files are preserved.

## Extension settings

Settings are resource-scoped and apply to the workspace folder containing each vault. Defaults:

| Setting                           |     Default | Purpose                                                                                                                                                         |
| --------------------------------- | ----------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stemlink.root`                   |     `notes` | Workspace-relative vault root for settings-based discovery.                                                                                                     |
| `stemlink.inbox`                  |     `inbox` | Capture folder name inside the vault.                                                                                                                           |
| `stemlink.notes`                  | `permanent` | Permanent-note folder name inside the vault.                                                                                                                    |
| `stemlink.templates`              | `templates` | Editable-example folder name inside the vault.                                                                                                                  |
| `stemlink.showCounts`             |      `true` | Show counts in the sidebar views and reference groups; errors remain visible when counts are hidden.                                                            |
| `stemlink.enableRouterIndexes`    |      `true` | Create routers on explicit Create/Open and refresh their generated counts after observed Markdown changes. Disabled leaves existing `INDEX.md` files untouched. |
| `stemlink.offerAgentInstructions` |      `true` | Ask before adding missing vault `AGENTS.md` files during Create/Open. Disabled skips prompts and installation.                                                  |

To share user-level Stemlink settings across devices, enable [VS Code Settings Sync](https://code.visualstudio.com/docs/configure/settings-sync) on each device, sign in, and include **Settings**. Excluded settings do not sync. Workspace and workspace-folder overrides, including paths saved by Create Vault, do not sync through Settings Sync. Vault files and workspace selection are not synced by Stemlink.

Configure all four names in VS Code settings, for example:

```json
{
  "stemlink.root": "vault",
  "stemlink.inbox": "capture",
  "stemlink.notes": "permanent",
  "stemlink.templates": "examples"
}
```

Create Vault prefills its three editable folder prompts from settings and uses the configured templates name without another prompt. Names must be single folder names; capture, permanent-note, and template folders must be distinct ignoring case. Creation saves the chosen settings and writes a new marker without overwriting an existing one.

Existing vaults can be recognized by a `.stemlink.json` file in the workspace root or an immediate child folder:

```json
{ "version": 1, "inbox": "inbox", "notes": "permanent", "templates": "templates" }
```

Folder names are relative to the file. Optional `templates` defaults to `templates`; set it to another distinct child folder such as `examples` to use your own template location. Existing markers need no migration and are not rewritten. Vaults in all workspace folders appear in the tree. Native row highlighting shows the selected vault without a checkmark or Selected label. Selection stays fixed across editor changes and refreshes; if that vault disappears, Stemlink selects the first remaining vault. Existing settings continue to work without a marker. If settings conflict with a marker for the same vault, choose its configuration.

An unset `stemlink.templates` retains the marker's template mapping. An explicit template setting participates in the configuration chooser when it conflicts with the marker. Choosing settings changes the effective paths without rewriting either configuration. Changing names never moves existing files.

The new defaults do not move or rename existing vaults. Existing markers and explicit folder settings retain their values. If an old vault relied on implicit defaults, use **Open Vault** or explicitly set its root, capture, and permanent-note names, for example `root=zk`, `inbox=inbox`, `notes=notes`.

Use **Stemlink: Open Vault** to select an existing folder. If no marker exists, confirm adding one and choose two existing child folders for captures and permanent notes. Cancellation leaves the folder unchanged. Folders outside discovery scope are added to the current workspace; with no workspace, the vault opens as one. Opening selects the vault without replacing settings, notes, or templates. Workspace Trust is required.

## Connect your notes

Permanent notes use timestamped filenames and YAML front matter. Write tags as a single-line list in every vault Markdown file that uses them:

```markdown
---
title: Filenames are stable addresses
tags: [zettelkasten]
---

Related: [[202411130915-ids-as-timestamps]]
```

- Click a link or press **F12** to navigate; type `[[` for completion.
- Use **Shift+F12** or **References > Inbound** for backlinks. **Outbound** shows links from the active note in the selected vault. Counts are link occurrences.
- Run **Check References** to find broken links and other note issues in the Problems panel. Files starting with `_` are excluded from the check.

Keep permanent filenames stable: renaming can break links. Stemlink warns about renames reported by VS Code, but cannot prevent all renames.

## Large vaults

There is no note-count limit. The selected vault's reference index builds in the background; inbound counts show `...` until ready. A first lookup can wait for indexing. In one 10,000-note benchmark, a cold index took about a minute.
