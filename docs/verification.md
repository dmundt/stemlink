# Verification

Run the smallest relevant check first. These commands use the scripts in [package.json](../package.json):

| Command                         | Purpose                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `npm audit`                     | Check direct and transitive dependencies for known vulnerabilities.               |
| `npm run lint`                  | Check JavaScript and TypeScript with ESLint.                                      |
| `npm run format:check`          | Check repository formatting with Prettier.                                        |
| `npm run format`                | Apply repository formatting.                                                      |
| `npm run compile`               | Compile and type-check.                                                           |
| `npm test`                      | Compile and run core tests.                                                       |
| `npm run test:integration`      | Run the main VS Code host workflow and virtual filesystem tests.                  |
| `npm run test:discovery`        | Run discovery, selection, Open Vault, settings, and dynamic vault-file workflows. |
| `npm run test:multi-root`       | Run multi-root creation, selection, and workspace workflows.                      |
| `npm run test:coverage`         | Run core and all three host runners with Node coverage.                           |
| `npm run benchmark`             | Measure parsing and auditing of 10,000 synthetic notes.                           |
| `npm run benchmark:integration` | Exercise a 10,000-note VS Code host fixture.                                      |
| `npm run build`                 | Compile the extension.                                                            |

Linting requires Node.js 22.13 or newer in the Node 22 line. Host tests and coverage require Node.js 22 or newer. Host runners use `STEMLINK_CODE_PATH` when set, an installed Windows VS Code when available, or a downloaded stable build. `VSCODE_TEST_VERSION` selects a downloaded host version. Runners create isolated temporary workspaces and profiles and clean them up afterward.

Core tests exercise metadata, promotion, references, audits, routing, and manual rendering. Host tests exercise commands, providers, custom paths, generated files, native selection, concurrent edits, error handling, and mocked filesystem behavior. Host runners launch with Workspace Trust disabled; they do not establish Restricted Mode behavior.

Router tests verify YAML description/title selection, escaped local-file mappings, discovery refresh, unsaved metadata and revert, file creation/rename/deletion, filesystem failures, and preservation of deleted or user-owned indexes. Refreshes rely on delivered events and are debounced; they are not instantaneous.

The host test checks each contributed Stemlink setting's resource scope and default. This confirms manifest eligibility for user-level VS Code Settings Sync, not an actual cross-device sync; the test hosts do not sign in or enable Settings Sync.

The [quality workflow](../.github/workflows/quality.yml) runs the full dependency audit, lint, formatting check, coverage, and build on Windows, Linux, and macOS against VS Code 1.90.0 and stable. It runs the host benchmark on Linux stable. Benchmark timings are observations, not enforced latency guarantees. Tests do not establish correctness for every filesystem, theme, platform configuration, or concurrent race.

Before a release, follow the validation and authorization requirements in [project rules](../AGENTS.md#github-flow-and-releases). The [publish workflow](../.github/workflows/publish.yml) validates the release tag and reuses the quality workflow. Release-asset upload and Marketplace publication then run independently using the verified package; either can fail after the other succeeds.
