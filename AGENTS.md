# Stemlink development rules

Stemlink is a VS Code extension for local, plain-Markdown vaults. Start with [the ADR index](docs/adr/index.md).

## Project layout

- `src/`: extension source and tests; keep core logic VS Code-independent.
- `templates/`: files copied into new vaults.
- `docs/adr/`: architecture decisions and their index.

## Validation

Run the smallest relevant check, then escalate if needed.

- Compile and type-check: `npm run compile`
- Type-check without emitting files: `npm run typecheck`
- Unit tests: `npm test`
- VS Code host tests: `npm run test:integration`, `npm run test:multi-root`, and `npm run test:discovery`
- Core and host coverage: `npm run test:coverage`
- 10,000-note host benchmark: `npm run benchmark:integration`
- Build: `npm run build`

Use Node.js 22.13+ within major 22, or Node.js 24+, with npm 10+. Host tests use `STEMLINK_CODE_PATH` if set, a local VS Code installation if available, or a downloaded stable build. Set `VSCODE_TEST_VERSION` to download a specific version.

Run `npm ci` to install Git hooks. Pre-commit formats staged files and lints staged JavaScript/TypeScript; pre-push runs `npm run typecheck` and `npm test`. Run `npm run test:host` for extension behavior changes.

## Change rules

- Keep changes surgical; leave unrelated defects untouched.
- Follow VS Code extension best practices and use the provided VS Code APIs.
- Use runtime built-ins and existing runtime dependencies only; do not add runtime libraries. `@vscode/vsce` is permitted as a development-only packaging tool. Update manifest and lockfile together when dependencies change.
- Keep the extension minimal, boring, simple, functional, and native. Every visible element must serve a requirement or usability need.
- Do not add extension-owned network or provider calls, telemetry, databases, or shell execution.
- Require Workspace Trust for workspace mutations, generation, and preview.
- Write concise, factual Markdown without filler or hype. Preserve required user-supplied content and third-party or legal notices.
- Keep the Marketplace README introduction to 5-15 factual, scannable lines; avoid unverifiable claims.
- Keep the README and related documentation current. Record only user-facing changes in the changelog, not internal refactors, tests, or tooling.
- Before 1.0.0, treat releases as public betas. Document breaking format or metadata changes and assess migration and compatibility for existing users.
- Consult [the ADR index](docs/adr/index.md) for relevant decisions. Add an ADR for each feature and keep the index current. Every ADR must start with YAML front matter containing its `status`. Do not contradict an accepted ADR; supersede it with a new ADR.
- Comment only when clarification is needed.

## GitHub issues

- Assign appropriate existing repository labels when creating an issue. Do not create labels; report if no existing label fits or labeling fails.

## GitHub Flow and releases

- Use simple GitHub Flow for a single developer or small team: protected `main`, short-lived feature branches, and pull requests into `main`. Do not add a long-lived `develop` branch or require approving reviews; required checks must pass before merging.
- Non-main branch pushes run install and build. Pull requests to `main` run lint, typecheck, unit tests, and host tests; the required check is **PR validation**. Expensive validation runs nightly or manually.
- Run build and relevant tests locally for non-main branch merges.
- Keep `main` deployable. Base each independent, short-lived feature branch on the latest published `main`; use a descriptive name. Keep unrelated changes separate and record dependencies on prerequisite branches.
- Make changes on feature branches with behavior tests and directly related documentation. Preserve unrelated work. Never reset, discard, amend, rebase, force-push, or delete existing branches without explicit authorization.
- Publish authorized feature branches to every applicable remote. Open pull requests into `main`; address requested reviews and merge only after required checks pass. Use merge commits.
- Ordinary edit requests do not authorize commits, pull-request merges, tags, or publication. Retain branches unless deletion is explicitly authorized.
- Protect only `main` with a ruleset requiring pull requests and **PR validation**, zero required approvals, stale-approval dismissal, and no bypass actors. Block force-pushes and deletion; enable automatic deletion of merged head branches. See [GitHub settings](docs/github-settings.md).
- Protect release tags matching `v[0-9]*` with an active tag ruleset. Block updates and deletion, allow new tags, and configure no bypass actors.
- Never commit or push directly to protected branches. Publish approved updates through pull requests to every configured remote. Verify protected refs match on all remotes; report divergence or remotes that could not be updated.
- For release metadata, create a feature branch from published `main`. Choose SemVer from included changes and assess compatibility. Run `npm version <version> --no-git-tag-version --ignore-scripts`; verify manifest and lockfile versions agree. Move user-facing changelog entries to the release version, retain `Unreleased`, and update any README VSIX example.
- The tag workflow accepts only matching `v<version>` tags pointing to a commit on `main`; it builds, packages, creates a GitHub Release, and publishes through Marketplace Trusted Publishing.
- Use numeric package versions and the boolean `vsce.preRelease` for release-channel selection. SemVer prerelease suffixes are unsupported. Both lockfile versions must match the manifest.
- Before declaring a release ready, run coverage, build, relevant host tests, and `git diff --check`; report unavailable validation. Do not manually package, tag, publish, or deploy without explicit authorization. Previously approved CI packaging remains allowed.
- Do not add `Co-authored-by:` trailers to feature, merge, or release commits.

## Commit messages

Use Conventional Commits with a lowercase type and concise description: `<type>: <description>`. Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, and `chore`.
