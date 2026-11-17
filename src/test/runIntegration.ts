import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';
import { makeNote } from '../core';

export async function runIntegration(
  multiRoot = false,
  discovery = false,
  restricted = process.argv.includes('--restricted'),
): Promise<void> {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'stemlink-test-'));
  try {
    const workspace = path.join(temp, 'workspace');
    const userData = path.join(temp, 'user-data');
    await mkdir(path.join(userData, 'User'), { recursive: true });
    await writeFile(
      path.join(userData, 'User', 'settings.json'),
      JSON.stringify({
        'stemlink.promptForCaptureHeadline': false,
        'stemlink.confirmPromotion': false,
        ...(restricted
          ? {
              'security.workspace.trust.enabled': true,
              'security.workspace.trust.startupPrompt': 'never',
            }
          : {}),
      }),
    );
    const root = path.join(workspace, discovery ? 'existing-vault' : 'notes');
    const notes = path.join(root, discovery ? 'stable' : 'permanent');
    await mkdir(notes, { recursive: true });
    await mkdir(path.join(root, discovery ? 'fleeting' : 'inbox'), { recursive: true });
    if (discovery) {
      await writeFile(
        path.join(root, '.stemlink.json'),
        JSON.stringify({ version: 1, inbox: 'fleeting', notes: 'stable' }),
      );
      await writeFile(path.join(notes, '_fleeting.md'), 'A fleeting thought.\n');
      const other = path.join(workspace, 'other-vault');
      await mkdir(path.join(other, 'notes'), { recursive: true });
      await mkdir(path.join(other, 'inbox'), { recursive: true });
      await writeFile(
        path.join(other, '.stemlink.json'),
        JSON.stringify({ version: 1, inbox: 'inbox', notes: 'notes' }),
      );
      await writeFile(path.join(other, 'notes', '_fleeting.md'), 'Other vault capture.\n');
      await writeFile(
        path.join(other, 'notes', '202601011200-note-1.md'),
        makeNote('Other note', []),
      );
    }
    let workspaceTarget = workspace;
    if (multiRoot) {
      const second = path.join(temp, 'second-workspace');
      await mkdir(second, { recursive: true });
      workspaceTarget = path.join(temp, 'test.code-workspace');
      await writeFile(
        workspaceTarget,
        JSON.stringify({ folders: [{ path: workspace }, { path: second }] }),
      );
    }
    const benchmark = process.argv.includes('--benchmark');
    const disableMarkdownProvider = process.argv.includes('--without-markdown-provider');
    const count = benchmark ? 10_000 : 3;
    for (let i = 0; i < count; i += 100) {
      await Promise.all(
        Array.from({ length: Math.min(100, count - i) }, (_, index) => {
          const n = i + index;
          const stem = `202601011200-note-${n}`;
          const body = `References [[202601011200-note-${(n + 1) % count}]].\n`;
          return writeFile(path.join(notes, `${stem}.md`), makeNote(`Note ${n}`, ['test'], body));
        }),
      );
    }
    const localExecutable =
      process.platform === 'win32' && process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe')
        : undefined;
    const executable =
      process.env.STEMLINK_CODE_PATH ??
      (!process.env.VSCODE_TEST_VERSION && localExecutable && existsSync(localExecutable)
        ? localExecutable
        : undefined);
    const options = {
      vscodeExecutablePath: executable,
      version: process.env.VSCODE_TEST_VERSION,
      extensionDevelopmentPath: path.resolve(__dirname, '../..'),
      extensionTestsPath: path.resolve(__dirname, 'vscodeHost.js'),
      launchArgs: [
        workspaceTarget,
        `--user-data-dir=${userData}`,
        `--extensions-dir=${path.join(temp, 'extensions')}`,
        ...(restricted ? [] : ['--disable-workspace-trust']),
        ...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []),
        ...(disableMarkdownProvider
          ? ['--disable-extension=vscode.markdown-language-features']
          : []),
      ],
      extensionTestsEnv: {
        STEMLINK_BENCHMARK: benchmark ? '1' : '0',
        STEMLINK_DISABLE_MARKDOWN_PROVIDER: disableMarkdownProvider ? '1' : '0',
        STEMLINK_MULTI_ROOT: multiRoot ? '1' : '0',
        STEMLINK_DISCOVERY: discovery ? '1' : '0',
        STEMLINK_RESTRICTED: restricted ? '1' : '0',
      },
    };
    if (restricted) {
      const code = executable ?? (await downloadAndUnzipVSCode(process.env.VSCODE_TEST_VERSION));
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          code,
          [
            ...options.launchArgs,
            `--extensionDevelopmentPath=${options.extensionDevelopmentPath}`,
            `--extensionTestsPath=${options.extensionTestsPath}`,
            '--skip-welcome',
            '--skip-release-notes',
          ],
          { env: { ...process.env, ...options.extensionTestsEnv }, stdio: 'inherit' },
        );
        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error('Restricted Mode host timed out.'));
        }, 120_000);
        child.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once('exit', (status) => {
          clearTimeout(timeout);
          if (status === 0) resolve();
          else reject(new Error(`Restricted Mode host exited with ${status}.`));
        });
      });
    } else {
      await runTests(options);
    }
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

if (require.main === module) {
  void runIntegration().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
