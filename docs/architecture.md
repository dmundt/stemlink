# Architecture

Stemlink is a VS Code extension for plain Markdown vaults. It uses native views, editors, diagnostics, and filesystem APIs. There is no extension-owned database, webview, telemetry, or network provider.

## Components

| Layer                             | Responsibility                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| [core](../src/core)               | VS Code-independent metadata, note creation and promotion, links, audits, and rendering.            |
| [application](../src/application) | VS Code-independent in-memory note and backlink index.                                              |
| [platform](../src/platform)       | Vault paths, filesystem and document updates, and index integration.                                |
| [workbench](../src/workbench)     | Activation, discovery, native views and providers, preview, routers, and agent-instruction prompts. |

[extension.ts](../src/extension.ts) exports the workbench activation entry point.
Core and application do not import VS Code; platform uses application and core,
and workbench composes the platform and native UI.

## Data flow

- Discovery examines each workspace folder and its immediate child directories for markers. Compatible configured paths can also identify a vault. Conflicting explicit settings and markers prompt for a choice.
- The selected vault starts its content/backlink index in the background. Filename lookup is separate, so navigation and completion need not wait for the full content scan.
- `Vault` indexes direct-child Markdown files in the configured notes directory. Open document text is used when available; file and document events update the index. Revision checks prevent an old scan or read from replacing newer state.
- The in-memory index is authoritative for live note/reference state. Generated vault `INDEX.md` files are navigation aids, not an authoritative index.
- References in the sidebar use the active note only when it belongs to the selected vault. Language providers resolve a document against its own discovered vault.
- View titles and reference groups show counts by default. `stemlink.showCounts` hides counts and pending placeholders; errors remain visible. Changing the setting refreshes the views.
- The Vaults view supplies the native Activity Bar badge with the number of discovered vaults across workspace folders. It is absent for zero vaults and remains visible when view counts are hidden.

See [storage](./storage.md) for file ownership and [verification](./verification.md) for test coverage and limitations.
