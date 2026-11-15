import * as vscode from "vscode";
import {
  isVaultInstructionFile, renderRouterIndexes, replaceRouterIndexSection, routerIndexName,
} from "./core";
import { directChild, reportError, sameUri, VaultPaths } from "./vault";

interface WatcherState {
  paths: VaultPaths;
  watcher: vscode.FileSystemWatcher;
  subscriptions: vscode.Disposable[];
  timer?: ReturnType<typeof setTimeout>;
}

export class VaultRouterIndexes implements vscode.Disposable {
  private readonly watchers = new Map<string, WatcherState>();

  sync(vaultPaths: readonly VaultPaths[]): void {
    const current = new Map(vaultPaths.map(paths => [paths.root.toString(), paths]));
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
        new vscode.RelativePattern(paths.root, "**/*.md"),
      );
      const state: WatcherState = { paths, watcher, subscriptions: [] };
      state.subscriptions.push(
        watcher.onDidCreate(uri => this.fileChanged(state, uri)),
        watcher.onDidChange(uri => this.fileChanged(state, uri)),
        watcher.onDidDelete(uri => this.fileChanged(state, uri)),
      );
      this.watchers.set(key, state);
    }
  }

  async initialize(paths: VaultPaths): Promise<string[]> {
    if (!vscode.workspace.isTrusted) throw new Error("Trust the workspace before writing vault indexes.");
    if (!await this.isDirectory(paths.root)) throw new Error(`Vault folder does not exist: ${paths.root.path}`);
    const inboxExists = await this.isDirectory(paths.inbox);
    const notesExist = await this.isDirectory(paths.notes);
    const inboxCount = inboxExists ? await this.markdownCount(paths.inbox) : 0;
    const notesCount = notesExist ? await this.markdownCount(paths.notes) : 0;
    const contents = renderRouterIndexes(
      this.folderName(paths.root), this.folderName(paths.inbox), this.folderName(paths.notes), inboxCount, notesCount,
    );
    const results: [string, "created" | "updated" | "unchanged" | "preserved"][] = [
      [routerIndexName, await this.write(paths.root, contents.root, true)],
    ];
    if (inboxExists) results.push([
      `${this.folderName(paths.inbox)}/${routerIndexName}`,
      await this.write(paths.inbox, contents.inbox, true),
    ]);
    if (notesExist) results.push([
      `${this.folderName(paths.notes)}/${routerIndexName}`,
      await this.write(paths.notes, contents.notes, true),
    ]);
    const missing = [
      ...(!inboxExists ? [`${this.folderName(paths.inbox)}/${routerIndexName}`] : []),
      ...(!notesExist ? [`${this.folderName(paths.notes)}/${routerIndexName}`] : []),
    ];
    if (missing.length) {
      void vscode.window.showWarningMessage(
        `Stemlink: could not create indexes in missing configured folders: ${missing.join(", ")}.`,
      );
    }
    return results.filter(([, result]) => result === "preserved").map(([name]) => name);
  }

  private async refresh(paths: VaultPaths): Promise<void> {
    if (!vscode.workspace.isTrusted) throw new Error("Trust the workspace before updating vault indexes.");
    const inboxExists = await this.isDirectory(paths.inbox);
    const notesExist = await this.isDirectory(paths.notes);
    const inboxCount = inboxExists ? await this.markdownCount(paths.inbox) : 0;
    const notesCount = notesExist ? await this.markdownCount(paths.notes) : 0;
    const contents = renderRouterIndexes(
      this.folderName(paths.root), this.folderName(paths.inbox), this.folderName(paths.notes), inboxCount, notesCount,
    );
    await this.write(paths.root, contents.root, false);
    if (inboxExists) await this.write(paths.inbox, contents.inbox, false);
    if (notesExist) await this.write(paths.notes, contents.notes, false);
  }

  private fileChanged(state: WatcherState, uri: vscode.Uri): void {
    const name = uri.path.slice(uri.path.lastIndexOf("/") + 1);
    if (isVaultInstructionFile(name) ||
        (!directChild(uri, state.paths.inbox) && !directChild(uri, state.paths.notes))) return;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = undefined;
      if (this.watchers.get(state.paths.root.toString()) !== state) return;
      void this.refresh(state.paths).catch(reportError);
    }, 100);
  }

  private async markdownCount(directory: vscode.Uri): Promise<number> {
    const entries = await vscode.workspace.fs.readDirectory(directory);
    return entries.filter(([name, type]) =>
      name.endsWith(".md") && !isVaultInstructionFile(name) && Boolean(type & vscode.FileType.File)).length;
  }

  private async isDirectory(uri: vscode.Uri): Promise<boolean> {
    try {
      if (!((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.Directory)) {
        throw new Error(`Configured vault path is not a folder: ${uri.path}`);
      }
      return true;
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return false;
      throw error;
    }
  }

  private async write(directory: vscode.Uri, content: string, createMissing: boolean): Promise<"created" | "updated" | "unchanged" | "preserved"> {
    const uri = vscode.Uri.joinPath(directory, routerIndexName);
    let current: string;
    try {
      current = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError && error.code === "FileNotFound")) throw error;
      if (!createMissing) return "unchanged";
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, { overwrite: false, ignoreIfExists: false, contents: Buffer.from(content, "utf8") });
      if (await vscode.workspace.applyEdit(edit)) return "created";
      current = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
    }
    const document = vscode.workspace.textDocuments.find(candidate => sameUri(candidate.uri, uri));
    if (document) current = document.getText();
    const updated = replaceRouterIndexSection(current, content);
    if (updated === undefined) return "preserved";
    if (updated === current) return "unchanged";
    if (document) {
      const wasDirty = document.isDirty;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(new vscode.Position(0, 0), document.positionAt(document.getText().length)), updated);
      if (!await vscode.workspace.applyEdit(edit)) throw new Error(`Could not update ${uri.path}.`);
      if (!wasDirty && !await document.save()) throw new Error(`Could not save updated index ${uri.path}.`);
      return "updated";
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(updated, "utf8"));
    return "updated";
  }

  private folderName(uri: vscode.Uri): string {
    return uri.path.slice(uri.path.lastIndexOf("/") + 1);
  }

  private samePaths(a: VaultPaths, b: VaultPaths): boolean {
    return sameUri(a.root, b.root) && sameUri(a.inbox, b.inbox) && sameUri(a.notes, b.notes);
  }

  private disposeWatcher(state: WatcherState): void {
    if (state.timer) clearTimeout(state.timer);
    state.subscriptions.forEach(subscription => subscription.dispose());
    state.watcher.dispose();
  }

  dispose(): void {
    for (const state of this.watchers.values()) this.disposeWatcher(state);
    this.watchers.clear();
  }
}
