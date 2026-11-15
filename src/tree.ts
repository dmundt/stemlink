import * as vscode from "vscode";
import { linksIn } from "./core";
import { Vault, directChild, reportError } from "./vault";

type Section = "Inbox" | "Notes" | "Ref From" | "Ref To";
export class Item extends vscode.TreeItem {
  constructor(
    label: string,
    readonly kind: Section | "note" | "capture" | "reference",
    readonly uri?: vscode.Uri,
    readonly offset?: number,
  ) {
    super(label, kind === "Inbox" || kind === "Notes" || kind === "Ref From" || kind === "Ref To"
      ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    if (kind === "Inbox") {
      this.tooltip = "Unprocessed captures.";
      this.contextValue = "stemlink.inbox";
    }
    if (kind === "Notes") this.tooltip = "Permanent notes.";
    if (kind === "Ref From") this.tooltip = "References from the active note.";
    if (kind === "Ref To") this.tooltip = "References to the active note.";
    if (kind === "capture") this.contextValue = "stemlink.capture";
    if (uri) {
      this.resourceUri = uri;
      this.command = { command: "stemlink.openAt", title: "Open", arguments: [uri, offset] };
    }
  }
}

export class VaultTree implements vscode.TreeDataProvider<Item>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Item | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly subscriptions: vscode.Disposable[];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly activeVault: () => Vault | undefined, vaults: Vault[]) {
    this.subscriptions = [
      ...vaults.map(vault => vault.changed.event(() => this.refresh())),
      vscode.workspace.createFileSystemWatcher("**/*.md"),
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
    ];
    const watcher = this.subscriptions[vaults.length] as vscode.FileSystemWatcher;
    this.subscriptions.push(watcher.onDidCreate(() => this.refresh()), watcher.onDidDelete(() => this.refresh()));
  }

  refresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.emitter.fire(undefined), 100);
  }
  getTreeItem(element: Item): vscode.TreeItem { return element; }

  async getChildren(element?: Item): Promise<Item[]> {
    try {
      const vault = this.activeVault();
      if (!vault) return [];
      if (!element) return (["Inbox", "Notes", "Ref From", "Ref To"] as const).map(name => new Item(name, name));
      if (element.kind === "Inbox") {
        let entries: [string, vscode.FileType][];
        try { entries = await vscode.workspace.fs.readDirectory(vault.paths.inbox); }
        catch (error) {
          if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return [];
          throw error;
        }
        return entries.filter(([name, type]) => name.endsWith(".md") && (type & vscode.FileType.File))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name]) => new Item(name, "capture", vscode.Uri.joinPath(vault.paths.inbox, name)));
      }
      if (element.kind === "Notes") {
        await vault.ensureNames();
        return vault.allTargets.sort((a, b) => a.name.localeCompare(b.name))
          .map(note => new Item(note.name, "note", note.uri));
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor || !directChild(editor.document.uri, vault.paths.notes)) return [];
      const name = editor.document.uri.path.slice(editor.document.uri.path.lastIndexOf("/") + 1);
      const stem = name.endsWith(".md") ? name.slice(0, -3) : "";
      if (element.kind === "Ref From") {
        await vault.ensureNames();
        return linksIn(editor.document.getText()).filter(link => link.valid).map(link => {
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
      if (element.kind === "Ref To") {
        await vault.ensure();
        return vault.references(stem).map(ref => new Item(ref.note.name, "reference", ref.note.uri, ref.link.start));
      }
      return [];
    } catch (error) {
      reportError(error);
      return [];
    }
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.subscriptions.forEach(item => item.dispose());
    this.emitter.dispose();
  }
}
