import * as vscode from "vscode";
import { isVaultInstructionFile, linksIn } from "./core";
import { Vault, directChild, reportError } from "./vault";

export type VaultSection = "Vaults" | "Fleeting" | "Notes" | "References";
type Section = VaultSection | "Inbound" | "Outbound";
export class Item extends vscode.TreeItem {
  constructor(
    label: string,
    readonly kind: Section | "vault" | "note" | "capture" | "reference",
    readonly uri?: vscode.Uri,
    readonly offset?: number,
    readonly vault?: Vault,
  ) {
    super(label, kind === "Vaults" || kind === "Fleeting" || kind === "Notes" ||
      kind === "References" || kind === "Inbound" || kind === "Outbound"
      ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    if (kind === "Vaults" || kind === "Fleeting" || kind === "Notes" || kind === "References" ||
        kind === "Inbound" || kind === "Outbound") this.id = `stemlink.${kind}`;
    if (kind === "Fleeting") {
      this.tooltip = "Unprocessed captures.";
      this.contextValue = "stemlink.inbox";
    }
    if (kind === "Notes") this.tooltip = "Permanent notes.";
    if (kind === "Inbound") this.tooltip = "References to the active note.";
    if (kind === "Outbound") this.tooltip = "References from the active note.";
    if (kind === "capture") this.contextValue = "stemlink.capture";
    if (kind === "vault" && vault) {
      this.id = `stemlink.vault:${vault.paths.root.toString()}`;
      this.command = { command: "stemlink.selectVault", title: "Select Vault", arguments: [vault.paths.root] };
    } else if (uri) {
      this.resourceUri = uri;
      this.command = { command: "stemlink.openAt", title: "Open", arguments: [uri, offset] };
    }
  }
}

export class VaultTree implements vscode.TreeDataProvider<Item>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Item | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly subscriptions: vscode.Disposable[];
  private readonly vaultSubscriptions = new Map<Vault, vscode.Disposable>();
  private readonly vaultItems = new Map<Vault, Item>();
  private readonly captureCounts = new Map<Vault, { path: string; count?: number; failed?: boolean }>();
  private readonly pendingNames = new Set<Vault>();
  private readonly failedNames = new Set<Vault>();
  private readonly namePaths = new Map<Vault, string>();
  private disposed = false;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly activeVault: () => Vault | undefined, private readonly vaults: () => readonly Vault[]) {
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.md");
    this.subscriptions = [
      watcher,
      watcher.onDidCreate(uri => this.filesChanged(uri)),
      watcher.onDidDelete(uri => this.filesChanged(uri)),
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      vscode.workspace.onDidChangeTextDocument(() => this.refresh()),
    ];
    this.syncVaults();
  }

  syncVaults(): void {
    const current = new Set(this.vaults());
    for (const [vault, subscription] of this.vaultSubscriptions) {
      if (!current.has(vault)) {
        subscription.dispose();
        this.vaultSubscriptions.delete(vault);
        this.vaultItems.delete(vault);
        this.captureCounts.delete(vault);
        this.failedNames.delete(vault);
        this.namePaths.delete(vault);
      }
    }

    for (const vault of current) {
      if (!this.vaultSubscriptions.has(vault)) this.vaultSubscriptions.set(vault, vault.changed.event(() => this.refresh()));
    }
    this.refresh();
  }

  private filesChanged(uri: vscode.Uri): void {
    for (const vault of this.vaults()) {
      if (directChild(uri, vault.paths.inbox)) this.captureCounts.delete(vault);
    }
    this.refresh();
  }

  private countCaptures(vault: Vault): number | string {
    let state = this.captureCounts.get(vault);
    const path = vault.paths.inbox.toString();
    if (state && state.path !== path) {
      this.captureCounts.delete(vault);
      state = undefined;
    }
    if (!state) {
      state = { path };
      this.captureCounts.set(vault, state);
      const current = state;
      void this.captures(vault).then(entries => {
        if (this.captureCounts.get(vault) !== current) return;
        current.count = entries.length;
        this.refresh();
      }, error => {
        if (this.captureCounts.get(vault) !== current) return;
        current.failed = true;
        reportError(error);
        this.refresh();
      });
    }
    return state.count ?? (state.failed ? "error" : "...");
  }

  private countNotes(vault: Vault): number | string {
    const path = vault.paths.notes.toString();
    if (this.namePaths.get(vault) !== path) {
      this.namePaths.set(vault, path);
      this.failedNames.delete(vault);
    }
    if (vault.namesReady) {
      this.failedNames.delete(vault);
      return vault.allTargets.length;
    }
    if (!this.pendingNames.has(vault) && !this.failedNames.has(vault)) {
      this.pendingNames.add(vault);
      void vault.ensureNames().then(() => {
        this.pendingNames.delete(vault);
        this.refresh();
      }, error => {
        this.pendingNames.delete(vault);
        if (vault.paths.notes.toString() === path) {
          this.failedNames.add(vault);
          reportError(error);
        }
        this.refresh();
      });
    }
    return this.failedNames.has(vault) ? "error" : "...";
  }

  refresh(): void {
    if (this.disposed) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.emitter.fire(undefined), 100);
  }
  getTreeItem(element: Item): vscode.TreeItem { return element; }

  private async captures(vault: Vault): Promise<[string, vscode.FileType][]> {
    try {
      return (await vscode.workspace.fs.readDirectory(vault.paths.inbox))
        .filter(([name, type]) => name.endsWith(".md") && !isVaultInstructionFile(name) && Boolean(type & vscode.FileType.File))
        .sort(([a], [b]) => a.localeCompare(b));
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return [];
      throw error;
    }
  }

  private activeNote(vault: Vault): vscode.TextDocument | undefined {
    const document = vscode.window.activeTextEditor?.document;
    const name = document?.uri.path.slice(document.uri.path.lastIndexOf("/") + 1) ?? "";
    return document && directChild(document.uri, vault.paths.notes) && document.uri.path.endsWith(".md") &&
      !isVaultInstructionFile(name) ? document : undefined;
  }

  private referenceCounts(vault: Vault, document: vscode.TextDocument | undefined): { inbound: number | undefined; outbound: number } {
    if (!document) return { inbound: 0, outbound: 0 };
    const name = document.uri.path.slice(document.uri.path.lastIndexOf("/") + 1, -3);
    return {
      inbound: vault.indexState === "ready" ? vault.references(name).length : undefined,
      outbound: linksIn(document.getText()).filter(link => link.valid).length,
    };
  }

  async getChildren(element?: Item): Promise<Item[]> {
    try {
      const vault = this.activeVault();
      if (!element) {
        let fleeting: number | string = 0;
        let notes: number | string = 0;
        let references: number | string = 0;
        if (vault) {
          fleeting = this.countCaptures(vault);
          notes = this.countNotes(vault);
          const counts = this.referenceCounts(vault, this.activeNote(vault));
          references = counts.inbound === undefined ? (vault.indexState === "failed" ? "error" : "...")
            : counts.inbound + counts.outbound;
        }
        return [
          new Item(`Vaults (${this.vaults().length})`, "Vaults"),
          new Item(`Fleeting (${fleeting})`, "Fleeting"),
          new Item(`Notes (${notes})`, "Notes"),
          new Item(`References (${references})`, "References"),
        ];
      }
      if (element.kind === "Vaults") return this.vaults().map(candidate => {
        const root = candidate.paths.root;
        const label = root.path.slice(root.path.lastIndexOf("/") + 1) || candidate.folder.name;
        let item = this.vaultItems.get(candidate);
        if (!item) {
          item = new Item(label, "vault", undefined, undefined, candidate);
          this.vaultItems.set(candidate, item);
        }
        item.label = label;
        item.description = candidate.folder.name;
        item.tooltip = root.path;
        return item;
      });
      if (!vault) return [];
      if (element.kind === "Fleeting") {
        return (await this.captures(vault)).map(([name]) =>
          new Item(name, "capture", vscode.Uri.joinPath(vault.paths.inbox, name)));
      }
      if (element.kind === "Notes") {
        await vault.ensureNames();
        return vault.allTargets.sort((a, b) => a.name.localeCompare(b.name))
          .map(note => new Item(note.name, "note", note.uri));
      }
      const document = this.activeNote(vault);
      if (element.kind === "References") {
        const counts = this.referenceCounts(vault, document);
        return [
          new Item(`Inbound (${counts.inbound ?? (vault.indexState === "failed" ? "error" : "...")})`, "Inbound"),
          new Item(`Outbound (${counts.outbound})`, "Outbound"),
        ];
      }
      if (!document) return [];
      if (element.kind === "Outbound") {
        await vault.ensureNames();
        return linksIn(document.getText()).filter(link => link.valid).map(link => {
          const target = vault.target(link.stem);
          const item = new Item(link.stem, "reference", target?.uri);
          if (!target) {
            item.description = "Missing";
            item.iconPath = new vscode.ThemeIcon("warning");
            item.tooltip = `No note found for ${link.stem}.`;
          }
          return item;
        });
      }
      if (element.kind === "Inbound") {
        await vault.ensure();
        const name = document.uri.path.slice(document.uri.path.lastIndexOf("/") + 1, -3);
        return vault.references(name).map(ref => new Item(ref.note.name, "reference", ref.note.uri, ref.link.start));
      }
      return [];
    } catch (error) {
      reportError(error);
      return [];
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.vaultSubscriptions.forEach(item => item.dispose());
    this.vaultItems.clear();
    this.subscriptions.forEach(item => item.dispose());
    this.emitter.dispose();
  }
}

export class VaultTreeSection implements vscode.TreeDataProvider<Item>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Item | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly subscription: vscode.Disposable;
  readonly getParent?: (element: Item) => undefined;

  constructor(private readonly tree: VaultTree, private readonly section: VaultSection) {
    if (section === "Vaults") this.getParent = () => undefined;
    this.subscription = tree.onDidChangeTreeData(() => this.emitter.fire(undefined));
  }

  getTreeItem(element: Item): vscode.TreeItem {
    return this.tree.getTreeItem(element);
  }

  async getChildren(element?: Item): Promise<Item[]> {
    if (element) return this.tree.getChildren(element);
    const root = (await this.tree.getChildren()).find(item => item.kind === this.section);
    return root ? this.tree.getChildren(root) : [];
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }
}
