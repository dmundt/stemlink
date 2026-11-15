# Stemlink development rules

- Follow VS Code extension best practices and use the provided VS Code APIs.
- Use runtime built-ins and existing project dependencies only; do not add libraries.
- Keep the extension minimal, boring, and simple.
- Every ADR must start with YAML front matter containing its `status`.
- Consult `docs/adr/index.md` for decisions relevant to a change; add an ADR for each feature and keep the index current.
- Run `npm run test:coverage` to measure core and VS Code host coverage, and `npm run benchmark:integration` for the 10,000-note benchmark. Both require a recent Node.js; host tests require VS Code or `STEMLINK_CODE_PATH`.
