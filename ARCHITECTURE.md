# Architecture

Stemlink is a local-first VS Code extension for plain Markdown vaults.

- [`src/`](./src/) contains extension code and tests. Keep core vault, note, and metadata logic independent of VS Code where practical.
- [`templates/`](./templates/) contains files copied into new vaults.
- [`docs/architecture.md`](./docs/architecture.md) describes runtime components and data flow.
- [`docs/adr/index.md`](./docs/adr/index.md) indexes accepted and superseded architecture decisions.

Vault content remains plain files. The extension maintains in-memory indexes and does not add a database or remote provider integration. Workspace Trust gates file mutations and generated content. See [the security boundaries](./AGENTS.md#change-rules) and relevant ADRs before changing persistence, links, or workspace behavior.
