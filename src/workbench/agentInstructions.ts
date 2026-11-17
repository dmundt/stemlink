import * as vscode from 'vscode';
import { agentInstructionsName, markdownCodeSpan } from '../core/documents';
import { VaultPaths } from '../platform/vault';

interface AgentInstructionTarget {
  directory: vscode.Uri;
  label: string;
  template: string;
}

export class VaultAgentInstructions {
  private readonly skipped = new Set<string>();
  constructor(private readonly extensionUri: vscode.Uri) {}

  async offer(paths: VaultPaths): Promise<void> {
    if (!vscode.workspace.isTrusted)
      throw new Error('Trust the workspace before writing vault instructions.');
    const key = paths.root.toString();
    if (this.skipped.has(key)) return;
    const targets: AgentInstructionTarget[] = [
      { directory: paths.root, label: 'vault root', template: 'vault.md' },
      { directory: paths.inbox, label: this.folderName(paths.inbox), template: 'inbox.md' },
      { directory: paths.notes, label: this.folderName(paths.notes), template: 'notes.md' },
    ];
    const missing: { target: AgentInstructionTarget; uri: vscode.Uri }[] = [];
    const missingFolders: string[] = [];
    for (const target of targets) {
      if (!(await this.isDirectory(target.directory))) {
        missingFolders.push(target.label);
        continue;
      }
      const uri = vscode.Uri.joinPath(target.directory, agentInstructionsName);
      if (!(await this.isFile(uri))) missing.push({ target, uri });
    }
    if (!missing.length) return;

    const files = missing
      .map(({ target }) => `${target.label}/${agentInstructionsName}`)
      .join(', ');
    const unavailable = missingFolders.length
      ? ` Missing configured folders will not be created: ${missingFolders.join(', ')}.`
      : '';
    const answer = await vscode.window.showWarningMessage(
      `Add minimal agent instructions to ${files}? Existing AGENTS.md files will be preserved.${unavailable}`,
      { modal: true },
      'Add',
      'Skip',
    );
    if (answer === 'Skip') this.skipped.add(key);
    if (answer !== 'Add') return;

    const created: string[] = [];
    for (const { target, uri } of missing) {
      const source = vscode.Uri.joinPath(
        this.extensionUri,
        'templates',
        'agent-instructions',
        target.template,
      );
      const template = Buffer.from(await vscode.workspace.fs.readFile(source)).toString('utf8');
      const contents = Buffer.from(this.render(template, paths), 'utf8');
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, { overwrite: false, ignoreIfExists: false, contents });
      let wasCreated = false;
      try {
        wasCreated = await vscode.workspace.applyEdit(edit);
      } catch (error) {
        if (!(error instanceof vscode.FileSystemError && error.code === 'FileExists')) throw error;
      }
      if (wasCreated) {
        created.push(`${target.label}/${agentInstructionsName}`);
      } else if (!((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.File)) {
        throw new Error(`The vault's ${uri.path} exists but is not a file.`);
      }
    }
    if (created.length) {
      void vscode.window.showInformationMessage(
        `Stemlink: added agent instructions to ${created.join(', ')}.`,
      );
    }
    if (missingFolders.length) {
      void vscode.window.showWarningMessage(
        `Stemlink: could not add agent instructions to missing configured folders: ${missingFolders.join(', ')}.`,
      );
    }
  }

  private async isDirectory(uri: vscode.Uri): Promise<boolean> {
    try {
      if (!((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.Directory)) {
        throw new Error(`Configured vault path is not a folder: ${uri.path}`);
      }
      return true;
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') return false;
      throw error;
    }
  }

  private async isFile(uri: vscode.Uri): Promise<boolean> {
    try {
      if (!((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.File)) {
        throw new Error(`Agent instructions path is not a file: ${uri.path}`);
      }
      return true;
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') return false;
      throw error;
    }
  }

  private render(template: string, paths: VaultPaths): string {
    return template.replace(/\{\{(vaultRoot|inbox|notes|templates)\}\}/g, (_match, key: string) => {
      const directory =
        key === 'vaultRoot'
          ? paths.root
          : key === 'inbox'
            ? paths.inbox
            : key === 'notes'
              ? paths.notes
              : paths.templates;
      return markdownCodeSpan(`${this.folderName(directory)}/`);
    });
  }

  private folderName(uri: vscode.Uri): string {
    return uri.path.slice(uri.path.lastIndexOf('/') + 1);
  }
}
