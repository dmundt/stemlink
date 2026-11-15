import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";
import { makeNote } from "../core";

export async function runIntegration(multiRoot = false, discovery = false): Promise<void> {
  const temp = await mkdtemp(path.join(os.tmpdir(), "stemlink-test-"));
  try {
    const workspace = path.join(temp, "workspace");
    const root = path.join(workspace, discovery ? "existing-vault" : "notes");
    const notes = path.join(root, discovery ? "stable" : "permanent");
    await mkdir(notes, { recursive: true });
    await mkdir(path.join(root, discovery ? "fleeting" : "inbox"), { recursive: true });
    if (discovery) {
      await writeFile(
        path.join(root, ".stemlink.json"),
        JSON.stringify({ version: 1, inbox: "fleeting", notes: "stable" }),
      );
      await writeFile(path.join(notes, "_fleeting.md"), "A fleeting thought.\n");
      const other = path.join(workspace, "other-vault");
      await mkdir(path.join(other, "notes"), { recursive: true });
      await mkdir(path.join(other, "inbox"), { recursive: true });
      await writeFile(
        path.join(other, ".stemlink.json"),
        JSON.stringify({ version: 1, inbox: "inbox", notes: "notes" }),
      );
      await writeFile(path.join(other, "notes", "_fleeting.md"), "Other vault capture.\n");
      await writeFile(
        path.join(other, "notes", "202601011200-note-1.md"),
        makeNote("Other note", []),
      );
    }
    let workspaceTarget = workspace;
    if (multiRoot) {
      const second = path.join(temp, "second-workspace");
      await mkdir(second, { recursive: true });
      workspaceTarget = path.join(temp, "test.code-workspace");
      await writeFile(
        workspaceTarget,
        JSON.stringify({ folders: [{ path: workspace }, { path: second }] }),
      );
    }
    const benchmark = process.argv.includes("--benchmark");
    const disableMarkdownProvider = process.argv.includes("--without-markdown-provider");
    const count = benchmark ? 10_000 : 3;
    for (let i = 0; i < count; i += 100) {
      await Promise.all(
        Array.from({ length: Math.min(100, count - i) }, (_, index) => {
          const n = i + index;
          const stem = `202601011200-note-${n}`;
          const body = `References [[202601011200-note-${(n + 1) % count}]].\n`;
          return writeFile(path.join(notes, `${stem}.md`), makeNote(`Note ${n}`, ["test"], body));
        }),
      );
    }
    const localExecutable =
      process.platform === "win32" && process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe")
        : undefined;
    const executable =
      process.env.STEMLINK_CODE_PATH ??
      (!process.env.VSCODE_TEST_VERSION && localExecutable && existsSync(localExecutable)
        ? localExecutable
        : undefined);
    await runTests({
      vscodeExecutablePath: executable,
      version: process.env.VSCODE_TEST_VERSION,
      extensionDevelopmentPath: path.resolve(__dirname, "../.."),
      extensionTestsPath: path.resolve(__dirname, "vscodeHost.js"),
      launchArgs: [
        workspaceTarget,
        `--user-data-dir=${path.join(temp, "user-data")}`,
        `--extensions-dir=${path.join(temp, "extensions")}`,
        "--disable-workspace-trust",
        ...(process.platform === "linux" && process.env.CI ? ["--no-sandbox"] : []),
        ...(disableMarkdownProvider
          ? ["--disable-extension=vscode.markdown-language-features"]
          : []),
      ],
      extensionTestsEnv: {
        STEMLINK_BENCHMARK: benchmark ? "1" : "0",
        STEMLINK_DISABLE_MARKDOWN_PROVIDER: disableMarkdownProvider ? "1" : "0",
        STEMLINK_MULTI_ROOT: multiRoot ? "1" : "0",
        STEMLINK_DISCOVERY: discovery ? "1" : "0",
      },
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

if (require.main === module) {
  void runIntegration().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
