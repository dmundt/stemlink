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
| `npm test`                      | Compile and run core tests.                                                       |
| `npm run test:integration`      | Run the main VS Code host workflow and virtual filesystem tests.                  |
| `npm run test:discovery`        | Run discovery, selection, Open Vault, settings, and dynamic vault-file workflows. |
| `npm run test:multi-root`       | Run multi-root creation, selection, and workspace workflows.                      |
| `npm run test:coverage`         | Run core and all three host runners with Node coverage.                           |
| `npm run benchmark`             | Measure parsing and auditing of 10,000 synthetic notes.                           |
| `npm run benchmark:integration` | Exercise a 10,000-note VS Code host fixture.                                      |
| `npm run build`                 | Compile the extension.                                                            |

Use Node.js 22.13 or newer. Host runners use `STEMLINK_CODE_PATH` when set, an installed VS Code when available, or a downloaded stable build. `VSCODE_TEST_VERSION` selects a downloaded host version. Runners create isolated temporary workspaces and profiles and clean them up afterward.

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

Open a pull request into `main`. Branch CI runs install and build on non-main pushes. Pull request CI runs lint, typecheck, unit tests, and host tests; **PR validation** is the required check. Merge only after it passes.

Configure `main` to require pull requests and **PR validation**, zero approvals, stale-approval dismissal, and no bypass actors. Block force-pushes and deletion, and enable automatic deletion of merged branches. See [GitHub settings](./github-settings.md).

## Release workflow

Prepare release metadata on a branch and merge it into `main`. Follow the versioning and release validation steps in [project rules](../AGENTS.md#github-flow-and-releases). Push a matching `v<version>` tag on `main` to start the release workflow, which checks tag/version and ancestry, builds and packages the VSIX, creates a GitHub Release, and publishes through Trusted Publishing.

For example, after preparing version `0.2.0` and verifying the published `main` commit:

```sh
gh release create v0.2.0 --target main --prerelease --generate-notes
```

Core tests exercise metadata, promotion, references, audits, routing, and manual rendering. Host tests exercise commands, providers, custom paths, generated files, native selection, concurrent edits, error handling, and mocked filesystem behavior. Host runners launch with Workspace Trust disabled; they do not establish Restricted Mode behavior.

Router tests verify YAML description/title selection, escaped local-file mappings, discovery refresh, unsaved metadata and revert, file creation/rename/deletion, filesystem failures, and preservation of deleted or user-owned indexes. Refreshes rely on delivered events and are debounced; they are not instantaneous.

The host test checks each contributed Stemlink setting's resource scope and default. This confirms manifest eligibility for user-level VS Code Settings Sync, not an actual cross-device sync; the test hosts do not sign in or enable Settings Sync.

Nightly/manual validation runs dependency audit, formatting, coverage, and the host benchmark on Linux stable. Benchmark timings are observations, not enforced latency guarantees. Tests do not establish correctness for every filesystem, theme, platform configuration, or concurrent race.

Before a release, follow the validation and authorization requirements in [project rules](../AGENTS.md#github-flow-and-releases). The [publish workflow](../.github/workflows/publish.yml) validates the release tag and uploads the packaged VSIX to both the GitHub Release and Marketplace.
