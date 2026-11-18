# Verification

Run the smallest relevant check first. These commands use the scripts in [package.json](../package.json):

| Command                         | Purpose                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `npm audit`                     | Check direct and transitive dependencies for known vulnerabilities.               |
| `npm run lint`                  | Check JavaScript and TypeScript with ESLint.                                      |
| `npm run format:check`          | Check repository formatting with Prettier.                                        |
| `npm run format`                | Apply repository formatting.                                                      |
| `npm run compile`               | Compile and type-check.                                                           |
| `npm run typecheck`             | Type-check without emitting files.                                                |
| `npm test`                      | Run mock, core, and tooling tests.                                                |
| `npm run test:mock`             | Run selected VS Code API mock tests.                                              |
| `npm run test:ui`               | Exercise native workbench interactions with an isolated VS Code instance.         |
| `npm run test:integration`      | Run the main VS Code host workflow and virtual filesystem tests.                  |
| `npm run test:discovery`        | Run discovery, selection, Open Vault, settings, and dynamic vault-file workflows. |
| `npm run test:multi-root`       | Run multi-root creation, selection, and workspace workflows.                      |
| `npm run test:coverage`         | Run core, integration, multi-root, discovery, and Restricted Mode coverage.       |
| `npm run benchmark`             | Measure parsing and auditing of 10,000 synthetic notes.                           |
| `npm run benchmark:integration` | Exercise a 10,000-note VS Code host fixture.                                      |
| `npm run build`                 | Compile the extension.                                                            |

Use Node.js 22.13+ within major 22, or Node.js 24+, with npm 10+. Host runners use `STEMLINK_CODE_PATH` when set, an installed VS Code when available, or a downloaded stable build. `VSCODE_TEST_VERSION` selects a downloaded host version. Runners create isolated temporary workspaces and profiles and clean them up afterward.

Coverage gates enforce at least 95% lines, 91% branches, and 93% functions across emitted extension modules. Core scenarios run in both Node and the extension host. Vitest mock tests run separately and are not included in this combined coverage measurement. `npm run test:release` separately checks numeric release versions, explicit channel selection, tag matching, and both lockfile versions.

## Development workflow

Start a short-lived branch from the latest published `main`. Install dependencies with `npm ci`; this installs Husky hooks for the repository. The pre-commit hook formats staged files and lints staged TypeScript. The pre-push hook runs typecheck and unit tests. Run `npm run test:host` for changes that affect extension behavior.

```sh
git switch main
git pull --ff-only
git switch -c feat/example
npm ci
# Make and commit changes.
git push -u origin feat/example
```

Open a pull request into `main`. Branch CI runs install and build on non-main pushes. Pull request CI runs lint, typecheck, unit tests, host tests, and interactive UI smoke; **PR validation** is the required check. Merge only after it passes.

Configure `main` to require pull requests and **PR validation**, zero approvals, stale-approval dismissal, and no bypass actors. Block force-pushes and deletion, and enable automatic deletion of merged branches. See [GitHub settings](./github-settings.md).

## Release workflow

Prepare release metadata on a branch and merge it into `main`. Follow the versioning and release validation steps in [project rules](../AGENTS.md#github-flow-and-releases). Push a matching `v<version>` tag on `main` to start the release workflow, which checks tag/version and ancestry, builds and packages the VSIX, creates a GitHub Release, and publishes through Trusted Publishing.

For example, after preparing version `0.2.0` and verifying the published `main` commit:

```sh
git switch main
git pull --ff-only origin main
git tag v0.2.0
git push origin v0.2.0
```

Set the boolean `vsce.preRelease` in the version PR to select stable (`false`) or Marketplace prerelease (`true`). Both channels use distinct numeric versions; suffixes such as `-beta.1` are rejected. See [Development](../DEVELOPMENT.md#release) for partial-failure and retry behavior.

Core tests exercise metadata, promotion, references, audits, routing, and manual rendering. Host tests exercise commands, providers, custom paths, generated files, native selection, concurrent edits, error handling, and mocked filesystem behavior. Ordinary host runners disable Workspace Trust; `npm run test:restricted` tests Restricted Mode separately.

Router tests verify YAML description/title selection, escaped local-file mappings, discovery refresh, unsaved metadata and revert, file creation/rename/deletion, filesystem failures, and preservation of deleted or user-owned indexes. Refreshes rely on delivered events and are debounced; they are not instantaneous.

The host test checks each contributed Stemlink setting's resource scope and default. This confirms manifest eligibility for user-level VS Code Settings Sync, not an actual cross-device sync; the test hosts do not sign in or enable Settings Sync.

Nightly/manual validation runs dependency audit, formatting, coverage, and the host benchmark on Linux stable. Benchmark timings are observations, not enforced latency guarantees. Tests do not establish correctness for every filesystem, theme, platform configuration, or concurrent race.

The manual-only **Compatibility Validation** workflow runs host, Restricted Mode, and interactive UI tests on Windows, macOS, and Linux against VS Code 1.95.0 and stable. It does not publish. Dispatch it after its workflow file exists on the default branch.

### Copilot link tool

- Host tests verify tool listing, live unsaved links, occurrence limits, vault choice, missing notes, and Restricted Mode rejection. They do not invoke a model.
- In Copilot Chat Agent mode, enable **Get Stemlink Note Links**, reference `#stemlinkNoteLinks`, and request a known synthetic stem. Deny the first approval and verify no results are shared; retry and approve. Check locations, unresolved outbound targets, and no note prose.
- Open two fixture vaults with the same stem; verify the tool requests a vault choice before returning links and uses only the chosen vault on retry.
- Repeat discovery, approval, and follow-up checks separately in the Agents window, if available. Record unavailable tools or sessions as unsupported by that test environment, not as passing. Use only synthetic notes.

Before a release, follow the validation and authorization requirements in [project rules](../AGENTS.md#github-flow-and-releases). The [publish workflow](../.github/workflows/publish.yml) validates the release tag and uploads the packaged VSIX to both the GitHub Release and Marketplace.
