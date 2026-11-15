import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import { isVaultInstructionFile, Link, NoteData, linksIn } from "./core";

export interface VaultPaths {
  root: vscode.Uri;
  inbox: vscode.Uri;
  notes: vscode.Uri;
}

export function validFolderName(value: string): boolean {
  return value.trim() === value && value.length > 0 && value !== "." && value !== ".." &&
    !/[\\/:*?"<>|\x00-\x1f]/.test(value) && !/[. ]$/.test(value);
}

export function pathsFor(folder: vscode.WorkspaceFolder): VaultPaths {
  const config = vscode.workspace.getConfiguration("stemlink", folder.uri);
  const rootName = config.get<string>("root", "zk");
  const inboxName = config.get<string>("inbox", "inbox");
  const notesName = config.get<string>("notes", "notes");
  if (![rootName, inboxName, notesName].every(validFolderName) || inboxName.toLowerCase() === notesName.toLowerCase()) {
    throw new Error("Stemlink folder settings must be distinct valid folder names.");
  }
  const root = vscode.Uri.joinPath(folder.uri, rootName);
  return { root, inbox: vscode.Uri.joinPath(root, inboxName), notes: vscode.Uri.joinPath(root, notesName) };
}

export function sameUri(a: vscode.Uri, b: vscode.Uri): boolean {
  return a.toString() === b.toString();
}

export function directChild(uri: vscode.Uri, directory: vscode.Uri): boolean {
  const parent = uri.with({ path: uri.path.slice(0, uri.path.lastIndexOf("/")) });
  return sameUri(parent, directory);
}

export interface VaultNote extends NoteData {
  uri: vscode.Uri;
}

export interface NoteTarget {
  stem: string;
  name: string;
  uri: vscode.Uri;
}

export interface Reference {
  note: VaultNote;
  link: Link;
}

export class Vault implements vscode.Disposable {
  readonly changed = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [];
  private notes = new Map<string, VaultNote>();
  private targets = new Map<string, NoteTarget>();
  private incoming = new Map<string, Reference[]>();
  private refreshPromise: Promise<void> | undefined;
  private namesPromise: Promise<void> | undefined;
  private revision = 0;
  private namesRevision = 0;
  private readonly fileRevisions = new Map<string, number>();
  private initialized = false;
  private namesInitialized = false;
  private indexFailed = false;
  private disposed = false;
  private selectedPaths: VaultPaths | undefined;

  constructor(readonly folder: vscode.WorkspaceFolder) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, "**/*.md"));
    this.disposables.push(watcher,
      watcher.onDidCreate(uri => void this.onFile(uri, false)),
      watcher.onDidChange(uri => void this.onFile(uri, false)),
      watcher.onDidDelete(uri => void this.onFile(uri, true)),
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.scheme === this.folder.uri.scheme) {
          void this.onDocument(event.document);
        }
      }),
      vscode.workspace.onDidCloseTextDocument(document => void this.onFile(document.uri, false)));
  }

  get paths(): VaultPaths { return this.selectedPaths ?? pathsFor(this.folder); }
  selectPaths(paths: VaultPaths): void {
    if (this.selectedPaths && sameUri(this.selectedPaths.root, paths.root) &&
        sameUri(this.selectedPaths.inbox, paths.inbox) && sameUri(this.selectedPaths.notes, paths.notes)) return;
    this.selectedPaths = paths;
    this.revision++;
    this.namesRevision++;
    this.initialized = false;
    this.namesInitialized = false;
    this.indexFailed = false;
    this.notes.clear();
    this.targets.clear();
    this.incoming.clear();
    this.changed.fire();
  }
  get all(): VaultNote[] { return [...this.notes.values()]; }
  get namesReady(): boolean { return this.namesInitialized && !this.namesPromise; }
  get indexState(): "ready" | "indexing" | "failed" | "pending" {
    return this.refreshPromise ? "indexing" : this.indexFailed ? "failed" : this.initialized ? "ready" : "pending";
  }
  get(stem: string): VaultNote | undefined { return this.notes.get(stem); }
  get allTargets(): NoteTarget[] { return [...this.targets.values()]; }
  target(stem: string): NoteTarget | undefined { return this.targets.get(stem); }
  references(stem: string): Reference[] { return this.incoming.get(stem) ?? []; }

  async ensureNames(): Promise<void> {
    if (this.namesInitialized && !this.namesPromise) return;
    if (!this.namesPromise) {
      this.namesPromise = this.loadNames().finally(() => { this.namesPromise = undefined; });
    }
    await this.namesPromise;
  }

  private async loadNames(): Promise<void> {
    const revision = this.namesRevision;
    const notes = this.paths.notes;
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(notes);
    } catch (error) {
      if (revision !== this.namesRevision) return this.loadNames();
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") entries = [];
      else throw error;
    }
    if (this.disposed) return;
    if (revision !== this.namesRevision) return this.loadNames();
    const targets = new Map<string, NoteTarget>();
    for (const [name, type] of entries) {
      if (name.endsWith(".md") && !isVaultInstructionFile(name) && (type & vscode.FileType.File)) {
        const stem = name.slice(0, -3);
        targets.set(stem, { stem, name, uri: vscode.Uri.joinPath(notes, name) });
      }
    }
    this.targets = targets;
    this.namesInitialized = true;
    this.changed.fire();
  }

  async ensure(): Promise<void> {
    if (!this.initialized || this.refreshPromise) await this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.namesInitialized = false;
    this.namesRevision++;
    this.indexFailed = false;
    const status = vscode.window.setStatusBarMessage("Stemlink: indexing notes...");
    this.refreshPromise = this.load().catch(error => {
      this.initialized = false;
      this.indexFailed = true;
      throw error;
    }).finally(() => {
      status.dispose();
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }

  async recordFile(uri: vscode.Uri): Promise<void> {
    await this.onFile(uri, false);
  }

  private async load(): Promise<void> {
    const revision = this.revision;
    await this.ensureNames();
    const files = this.allTargets;
    const next = new Map<string, VaultNote>();
    const openDocuments = new Map(vscode.workspace.textDocuments.map(document => [document.uri.toString(), document]));
    for (let i = 0; i < files.length; i += 64) {
      if (this.disposed) return;
      const batch = files.slice(i, i + 64);
      let loaded: VaultNote[];
      try {
        loaded = await Promise.all(batch.map(async target => {
          const text = await this.read(target.uri, openDocuments);
          return { ...target, text, links: linksIn(text) };
        }));
      } catch (error) {
        if (this.disposed) return;
        if (revision !== this.revision) return this.load();
        throw error;
      }
      for (const note of loaded) next.set(note.stem, note);
    }
    if (revision !== this.revision) {
      this.initialized = false;
      return this.load();
    }
    this.notes = next;
    this.rebuildIncoming();
    this.initialized = true;
    this.changed.fire();
  }

  private async read(uri: vscode.Uri, openDocuments?: Map<string, vscode.TextDocument>): Promise<string> {
    const document = openDocuments
      ? openDocuments.get(uri.toString())
      : vscode.workspace.textDocuments.find(doc => sameUri(doc.uri, uri));
    if (document) return document.getText();
    if (uri.scheme !== "file") return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
    try { return await readFile(uri.fsPath, "utf8"); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw vscode.FileSystemError.FileNotFound(uri);
      }
      throw error;
    }
  }

  private rebuildIncoming(): void {
    this.incoming.clear();
    for (const note of this.notes.values()) {
      for (const link of note.links) {
        if (!link.valid) continue;
        const references = this.incoming.get(link.stem) ?? [];
        references.push({ note, link });
        this.incoming.set(link.stem, references);
      }
    }
  }

  private replace(note: VaultNote): void {
    const previous = this.notes.get(note.stem);
    if (previous) this.removeReferences(previous);
    this.notes.set(note.stem, note);
    for (const link of note.links) {
      if (!link.valid) continue;
      const refs = this.incoming.get(link.stem) ?? [];
      refs.push({ note, link });
      this.incoming.set(link.stem, refs);
    }
  }

  private removeReferences(note: VaultNote): void {
    for (const stem of new Set(note.links.map(link => link.stem))) {
      const refs = (this.incoming.get(stem) ?? []).filter(ref => ref.note.stem !== note.stem);
      if (refs.length) this.incoming.set(stem, refs);
      else this.incoming.delete(stem);
    }
  }

  private async onDocument(document: vscode.TextDocument): Promise<void> {
    try {
      if (this.disposed) return;
      const uri = document.uri;
      if (!directChild(uri, this.paths.notes) || !uri.path.endsWith(".md") ||
          isVaultInstructionFile(uri.path.slice(uri.path.lastIndexOf("/") + 1))) return;
      this.revision++;
      this.fileRevisions.set(uri.toString(), this.revision);
      const name = uri.path.slice(uri.path.lastIndexOf("/") + 1);
      const text = document.getText();
      const stem = name.slice(0, -3);
      this.targets.set(stem, { uri, name, stem });
      this.replace({ uri, name, stem, text, links: linksIn(text) });
      this.changed.fire();
    } catch (error) { reportError(error); }
  }

  private async onFile(uri: vscode.Uri, deleted: boolean): Promise<void> {
    try {
      if (this.disposed) return;
      if (!directChild(uri, this.paths.notes) || !uri.path.endsWith(".md") ||
          isVaultInstructionFile(uri.path.slice(uri.path.lastIndexOf("/") + 1))) return;
      this.revision++;
      this.namesRevision++;
      const currentRevision = this.revision;
      this.fileRevisions.set(uri.toString(), currentRevision);
      const name = uri.path.slice(uri.path.lastIndexOf("/") + 1);
      const stem = name.slice(0, -3);
      if (deleted) {
        this.targets.delete(stem);
        const old = this.notes.get(stem);
        if (old) this.removeReferences(old);
        this.notes.delete(stem);
      } else {
        this.targets.set(stem, { uri, name, stem });
        const text = await this.read(uri);
        if (this.disposed || this.fileRevisions.get(uri.toString()) !== currentRevision) return;
        this.replace({ uri, name, stem, text, links: linksIn(text) });
      }
      this.changed.fire();
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return;
      reportError(error);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.disposables.forEach(item => item.dispose());
    this.changed.dispose();
  }
}

export function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  void vscode.window.showErrorMessage(`Stemlink: ${message}`);
}
