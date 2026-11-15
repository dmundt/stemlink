import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";
import { makeNote } from "../core";

export async function runIntegration(multiRoot = false): Promise<void> {
  const temp = await mkdtemp(path.join(os.tmpdir(), "stemlink-test-"));
  try {
    const workspace = path.join(temp, "workspace");
    const notes = path.join(workspace, "zk", "notes");
    await mkdir(notes, { recursive: true });
    await mkdir(path.join(workspace, "zk", "inbox"), { recursive: true });
    let workspaceTarget = workspace;
    if (multiRoot) {
      const second = path.join(temp, "second-workspace");
      await mkdir(second, { recursive: true });
      workspaceTarget = path.join(temp, "test.code-workspace");
      await writeFile(workspaceTarget, JSON.stringify({ folders: [{ path: workspace }, { path: second }] }));
    }
    const benchmark = process.argv.includes("--benchmark");
    const disableMarkdownProvider = process.argv.includes("--without-markdown-provider");
    const count = benchmark ? 10_000 : 3;
    for (let i = 0; i < count; i += 100) {
      await Promise.all(Array.from({ length: Math.min(100, count - i) }, (_, index) => {
        const n = i + index;
        const stem = `202601011200-note-${n}`;
        const body = `References [[202601011200-note-${(n + 1) % count}]].\n`;
        return writeFile(path.join(notes, `${stem}.md`), makeNote(`Note ${n}`, ["test"], body));
      }));
    }
    const executable = process.env.STEMLINK_CODE_PATH ??
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe");
    await runTests({
      vscodeExecutablePath: executable,
      extensionDevelopmentPath: path.resolve(__dirname, "../.."),
      extensionTestsPath: path.resolve(__dirname, "vscodeHost.js"),
      launchArgs: [workspaceTarget, `--user-data-dir=${path.join(temp, "user-data")}`,
        `--extensions-dir=${path.join(temp, "extensions")}`, "--disable-workspace-trust",
        ...(disableMarkdownProvider ? ["--disable-extension=vscode.markdown-language-features"] : [])],
      extensionTestsEnv: { STEMLINK_BENCHMARK: benchmark ? "1" : "0", STEMLINK_DISABLE_MARKDOWN_PROVIDER: disableMarkdownProvider ? "1" : "0", STEMLINK_MULTI_ROOT: multiRoot ? "1" : "0" },
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

if (require.main === module) {
  void runIntegration().catch(error => { console.error(error); process.exitCode = 1; });
}
