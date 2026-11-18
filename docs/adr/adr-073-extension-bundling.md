---
status: Accepted
---

# ADR 073: Bundle extension entry point

## Context

TypeScript compilation emits the extension as multiple files. A single bundled
entry point simplifies VSIX contents and reduces module loading overhead.

## Decision

Use esbuild to bundle `src/extension.ts` into `dist/extension.js` for builds and
VSIX packaging. Target Node.js with ES2022 output, leave `vscode` external, and
bundle runtime dependencies. VSIX packaging excludes `node_modules` and
TypeScript test output. Run TypeScript type checking separately because esbuild
does not perform it.

Keep `npm run compile` as TypeScript module output for unit and host tests.
Ignore its nested `dist/src/` files when packaging the extension.

## Consequences

The VSIX entry point remains `dist/extension.js`; VS Code supplies the external
`vscode` module. Test runners retain compiled module files without shipping
them as extension runtime dependencies.
