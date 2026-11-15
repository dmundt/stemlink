# Commands and internal interfaces

The [manifest](../package.json) contributes these user-facing commands:

| Command ID | Action |
|---|---|
| `stemlink.openVault` | Select an existing vault; offer marker creation for an unmarked folder. |
| `stemlink.createVault` | Create or reuse configured vault folders and files. |
| `stemlink.addFleetingNote` | Create a capture from the fleeting template. |
| `stemlink.addNote` | Create a permanent note from entered title and tags. |
| `stemlink.promote` | Create a note from a selected inbox capture. |
| `stemlink.checkReferences` | Refresh the selected vault and report findings in Problems. |
| `stemlink.refresh` | Refresh the selected vault index and tree. |

`stemlink.selectVault` and `stemlink.openAt` are internal tree commands. Command failures are reported through native error notifications. Cancellation of a prompt stops its operation.

## Language providers

- Document links and definitions resolve valid wiki-link stems to indexed note filenames.
- References return incoming occurrences from the in-memory index. Completion suggests note stems while avoiding duplicate closing brackets.
- The manual audit reports invalid filenames, metadata, malformed or missing links, and notes without incoming or outgoing references. Underscore-prefixed files are excluded.

## Internal contracts

- `Vault.ensureNames()` loads filename targets; `Vault.ensure()` and `Vault.refresh()` load note content and backlinks. `Vault.references()` reads the in-memory index.
- `linksIn`, `makeNote`, `promoteNote`, and `auditNotes` in [core.ts](../src/core.ts) do not depend on VS Code.
- `VaultTree` supplies a shared tree model; `VaultTreeSection` adapts it to separate native views. `stemlink.showCounts` changes labels, not index or reference results.
- See the [README settings table](../README.md#extension-settings) for the public setting names, defaults, and resource scope.
