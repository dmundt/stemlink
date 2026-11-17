import * as vscode from 'vscode';
import {
  fleetingTitle,
  isVaultInstructionFile,
  RouterEntry,
  renderRouterIndexes,
  replaceRouterIndexSection,
  routerIndexName,
  routerDescription,
} from '../core/documents';
import { directChild, reportError, sameUri, VaultPaths } from '../platform/vault';

interface WatcherState {
  paths: VaultPaths;
  watcher: vscode.FileSystemWatcher;
  subscriptions: vscode.Disposable[];
  timer?: ReturnType<typeof setTimeout>;
  refreshing?: boolean;
  refreshAgain?: boolean;
}

export class VaultRouterIndexes implements vscode.Disposable {
  private readonly watchers = new Map<string, WatcherState>();
  private readonly pending = new Map<string, Promise<string[]>>();
  private readonly subscriptions: vscode.Disposable[];
  private disposed = false;

  constructor() {
    const changed = (uri: vscode.Uri) => {
      for (const state of this.watchers.values()) this.fileChanged(state, uri);
    };
    this.subscriptions = [
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length) changed(event.document.uri);
      }),
      vscode.workspace.onDidOpenTextDocument((document) => changed(document.uri)),
      vscode.workspace.onDidCloseTextDocument((document) => changed(document.uri)),
      vscode.workspace.onDidCreateFiles((event) => event.files.forEach(changed)),
      vscode.workspace.onDidDeleteFiles((event) => event.files.forEach(changed)),
      vscode.workspace.onDidRenameFiles((event) => {
        for (const file of event.files) {
          changed(file.oldUri);
          changed(file.newUri);
        }
      }),
      vscode.workspace.onDidGrantWorkspaceTrust(() => {
        for (const state of this.watchers.values()) this.schedule(state);
      }),
    ];
  }

  sync(vaultPaths: readonly VaultPaths[]): void {
    const current = new Map(vaultPaths.map((paths) => [paths.root.toString(), paths]));
    for (const [key, state] of this.watchers) {
      const paths = current.get(key);
      if (!paths || !this.samePaths(state.paths, paths)) {
        this.disposeWatcher(state);
        this.watchers.delete(key);
      }
    }
    for (const [key, paths] of current) {
      if (this.watchers.has(key)) continue;
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(paths.root, '**/*.md'),
      );
      const state: WatcherState = { paths, watcher, subscriptions: [] };
      state.subscriptions.push(
        watcher.onDidCreate((uri) => this.fileChanged(state, uri)),
        watcher.onDidChange((uri) => this.fileChanged(state, uri)),
        watcher.onDidDelete((uri) => this.fileChanged(state, uri)),
      );
      this.watchers.set(key, state);
      this.schedule(state);
    }
  }

  initialize(paths: VaultPaths): Promise<string[]> {
    return this.enqueue(paths, true);
  }

  async refresh(paths: VaultPaths): Promise<void> {
    await this.enqueue(paths, false);
  }

  private enqueue(
    paths: VaultPaths,
    createMissing: boolean,
    state?: WatcherState,
  ): Promise<string[]> {
    const key = paths.root.toString();
    const run = () => this.update(paths, createMissing, state);
    const previous = this.pending.get(key);
    const result = previous ? previous.then(run, run) : run();
    this.pending.set(key, result);
    const finished = () => {
      if (this.pending.get(key) === result) this.pending.delete(key);
    };
    void result.then(finished, finished);
    return result;
  }

  private async update(
    paths: VaultPaths,
    createMissing: boolean,
    state?: WatcherState,
  ): Promise<string[]> {
    const active = () =>
      !this.disposed && (!state || this.watchers.get(paths.root.toString()) === state);
    if (!active()) return [];
    if (!vscode.workspace.isTrusted)
      throw new Error('Trust the workspace before writing vault indexes.');
    if (!createMissing) {
      let managed = false;
      for (const directory of [paths.root, paths.inbox, paths.notes]) {
        const uri = vscode.Uri.joinPath(directory, routerIndexName);
        const document = vscode.workspace.textDocuments.find((candidate) =>
          sameUri(candidate.uri, uri),
        );
        try {
          const text =
            document?.getText() ??
            Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
          if (replaceRouterIndexSection(text, text) !== undefined) managed = true;
        } catch (error) {
          if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound'))
            throw error;
        }
      }
      if (!managed) return [];
    }
    if (!(await this.isDirectory(paths.root)))
      throw new Error(`Vault folder does not exist: ${paths.root.path}`);
    const inboxExists = await this.isDirectory(paths.inbox);
    const notesExist = await this.isDirectory(paths.notes);
    const inboxEntries = inboxExists ? await this.entries(paths.inbox, true) : [];
    const notesEntries = notesExist ? await this.entries(paths.notes) : [];
    const contents = renderRouterIndexes(
      this.folderName(paths.root),
      this.folderName(paths.inbox),
      this.folderName(paths.notes),
      inboxEntries,
      notesEntries,
      this.folderName(paths.templates),
    );
    if (!active()) return [];
    const results: [string, 'created' | 'updated' | 'unchanged' | 'preserved'][] = [
      [routerIndexName, await this.write(paths.root, contents.root, createMissing)],
    ];
    if (!active()) return [];
    if (inboxExists)
      results.push([
        `${this.folderName(paths.inbox)}/${routerIndexName}`,
        await this.write(paths.inbox, contents.inbox, createMissing),
      ]);
    if (!active()) return [];
    if (notesExist)
      results.push([
        `${this.folderName(paths.notes)}/${routerIndexName}`,
        await this.write(paths.notes, contents.notes, createMissing),
      ]);
    const missing = [
      ...(!inboxExists ? [`${this.folderName(paths.inbox)}/${routerIndexName}`] : []),
      ...(!notesExist ? [`${this.folderName(paths.notes)}/${routerIndexName}`] : []),
    ];
    if (createMissing && missing.length) {
      void vscode.window.showWarningMessage(
        `Stemlink: could not create indexes in missing configured folders: ${missing.join(', ')}.`,
      );
    }
    return results.filter(([, result]) => result === 'preserved').map(([name]) => name);
  }

  private fileChanged(state: WatcherState, uri: vscode.Uri): void {
    const name = uri.path.slice(uri.path.lastIndexOf('/') + 1);
    if (
      !name.endsWith('.md') ||
      isVaultInstructionFile(name) ||
      (!directChild(uri, state.paths.inbox) && !directChild(uri, state.paths.notes))
    )
      return;
    this.schedule(state);
  }

  private schedule(state: WatcherState): void {
    if (!vscode.workspace.isTrusted) return;
    if (state.refreshing) {
      state.refreshAgain = true;
      return;
    }
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = undefined;
      if (this.watchers.get(state.paths.root.toString()) !== state) return;
      state.refreshing = true;
      const finished = () => {
        state.refreshing = false;
        if (state.refreshAgain && this.watchers.get(state.paths.root.toString()) === state) {
          state.refreshAgain = false;
          this.schedule(state);
        }
      };
      void this.enqueue(state.paths, false, state).then(finished, (error: unknown) => {
        reportError(error);
        finished();
      });
    }, 100);
  }

  private async entries(directory: vscode.Uri, fleeting = false): Promise<RouterEntry[]> {
    const entries = await vscode.workspace.fs.readDirectory(directory);
    const files = entries.filter(
      ([name, type]) =>
        name.endsWith('.md') &&
        !isVaultInstructionFile(name) &&
        Boolean(type & vscode.FileType.File),
    );
    const result: RouterEntry[] = [];
    for (const [name] of files) {
      const uri = vscode.Uri.joinPath(directory, name);
      const document = vscode.workspace.textDocuments.find((candidate) =>
        sameUri(candidate.uri, uri),
      );
      let text: string;
      if (document) text = document.getText();
      else {
        try {
          text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
        } catch (error) {
          if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') continue;
          throw error;
        }
      }
      let description: string;
      try {
        description = fleeting ? fleetingTitle(text) : routerDescription(text);
      } catch (error) {
        reportError(
          new Error(`${uri.path}: ${error instanceof Error ? error.message : String(error)}`),
        );
        description = 'Invalid YAML front matter.';
      }
      result.push({ name, description });
    }
    return result;
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

  private async write(
    directory: vscode.Uri,
    content: string,
    createMissing: boolean,
  ): Promise<'created' | 'updated' | 'unchanged' | 'preserved'> {
    if (!vscode.workspace.isTrusted)
      throw new Error('Trust the workspace before writing vault indexes.');
    const uri = vscode.Uri.joinPath(directory, routerIndexName);
    let current: string;
    try {
      current = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) throw error;
      if (!createMissing) return 'unchanged';
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, {
        overwrite: false,
        ignoreIfExists: false,
        contents: Buffer.from(content, 'utf8'),
      });
      if (await vscode.workspace.applyEdit(edit)) return 'created';
      current = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    }
    const document = vscode.workspace.textDocuments.find((candidate) =>
      sameUri(candidate.uri, uri),
    );
    if (document) current = document.getText();
    const updated = replaceRouterIndexSection(current, content);
    if (updated === undefined) return 'preserved';
    if (updated === current) return 'unchanged';
    if (document) {
      const wasDirty = document.isDirty;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        uri,
        new vscode.Range(new vscode.Position(0, 0), document.positionAt(document.getText().length)),
        updated,
      );
      if (!(await vscode.workspace.applyEdit(edit)))
        throw new Error(`Could not update ${uri.path}.`);
      if (!wasDirty && !(await document.save()))
        throw new Error(`Could not save updated index ${uri.path}.`);
      return 'updated';
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(updated, 'utf8'));
    return 'updated';
  }

  private folderName(uri: vscode.Uri): string {
    return uri.path.slice(uri.path.lastIndexOf('/') + 1);
  }

  private samePaths(a: VaultPaths, b: VaultPaths): boolean {
    return (
      sameUri(a.root, b.root) &&
      sameUri(a.inbox, b.inbox) &&
      sameUri(a.notes, b.notes) &&
      sameUri(a.templates, b.templates)
    );
  }

  private disposeWatcher(state: WatcherState): void {
    if (state.timer) clearTimeout(state.timer);
    state.subscriptions.forEach((subscription) => subscription.dispose());
    state.watcher.dispose();
  }

  dispose(): void {
    this.disposed = true;
    this.subscriptions.forEach((subscription) => subscription.dispose());
    for (const state of this.watchers.values()) this.disposeWatcher(state);
    this.watchers.clear();
  }
}
