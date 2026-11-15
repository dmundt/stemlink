# Verification

Run the smallest relevant check first. These commands use the scripts in [package.json](../package.json):

| Command | Purpose |
|---|---|
| `npm run compile` | Compile and type-check. |
| `npm test` | Compile and run core tests. |
| `npm run test:integration` | Run the main VS Code host workflow and virtual filesystem tests. |
| `npm run test:discovery` | Run discovery, selection, Open Vault, settings, and dynamic vault-file workflows. |
| `npm run test:multi-root` | Run multi-root creation, selection, and workspace workflows. |
| `npm run test:coverage` | Run core and all three host runners with Node coverage. |
| `npm run benchmark` | Measure parsing and auditing of 10,000 synthetic notes. |
| `npm run benchmark:integration` | Exercise a 10,000-note VS Code host fixture. |
| `npm run build` | Compile the extension. |

Host tests and coverage require Node.js 22 or newer. Host runners use `STEMLINK_CODE_PATH` when set, an installed Windows VS Code when available, or a downloaded stable build. `VSCODE_TEST_VERSION` selects a downloaded host version. Runners create isolated temporary workspaces and profiles and clean them up afterward.

Core tests exercise metadata, promotion, references, audits, routing, and manual rendering. Host tests exercise commands, providers, custom paths, generated files, native selection, concurrent edits, error handling, and mocked filesystem behavior. Host runners launch with Workspace Trust disabled; they do not establish Restricted Mode behavior.

The [quality workflow](../.github/workflows/quality.yml) runs coverage on Windows, Linux, and macOS against VS Code 1.90.0 and stable, and runs the host benchmark on Linux stable. Benchmark timings are observations, not enforced latency guarantees. Tests do not establish correctness for every filesystem, theme, platform configuration, or concurrent race.

Before a release, follow the validation and authorization requirements in [project rules](../AGENTS.md#github-flow-and-releases). The [publish workflow](../.github/workflows/publish.yml) validates the release tag and reuses the quality workflow before attaching and publishing its verified package.
