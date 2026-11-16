import * as vscode from "vscode";
import { isExcludedNoteFile, linksIn, normalizeTags, noteTags } from "./core";
import { Vault, VaultNote, directChild, reportError } from "./vault";

export type VaultSection = "Vaults" | "Fleeting" | "Notes" | "References";
type Section = VaultSection | "Inbound" | "Outbound";
interface TagSummary {
  notes: { note: VaultNote; tags: readonly string[] }[];
  counts: Map<string, number>;
}
interface TagState {
  selected: readonly string[];
  path: string;
  summary?: TagSummary;
  problems?: ReadonlySet<string>;
  diagnosticUris?: readonly vscode.Uri[];
}
export class Item extends vscode.TreeItem {
  constructor(
    label: string,
    readonly kind: Section | "vault" | "note" | "capture" | "reference",
    readonly uri?: vscode.Uri,
    readonly offset?: number,
    readonly vault?: Vault,
  ) {
    super(
      label,
      kind === "Inbound" || kind === "Outbound"
        ? vscode.TreeItemCollapsibleState.Expanded
        : kind === "Vaults" || kind === "Fleeting" || kind === "Notes" || kind === "References"
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
    );
    if (
      kind === "Vaults" ||
      kind === "Fleeting" ||
      kind === "Notes" ||
      kind === "References" ||
      kind === "Inbound" ||
      kind === "Outbound"
    )
      this.id = `stemlink.${kind}`;
    if (kind === "Fleeting") {
      this.tooltip = "Unprocessed captures.";
      this.contextValue = "stemlink.inbox";
    }
    if (kind === "Notes") this.tooltip = "Permanent notes.";
    if (kind === "Inbound") this.tooltip = "References to the active note.";
    if (kind === "Outbound") this.tooltip = "References from the active note.";
    if (kind === "capture") this.contextValue = "stemlink.capture";
    if (kind === "note") this.contextValue = "stemlink.note";
    if (kind === "vault" && vault) {
      this.contextValue = "stemlink.vault";
      this.iconPath = new vscode.ThemeIcon("archive");
      this.id = `stemlink.vault:${vault.paths.root.toString()}`;
      this.command = {
        command: "stemlink.selectVault",
        title: "Select vault",
        arguments: [vault.paths.root],
      };
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
  private readonly captureCounts = new Map<
    Vault,
    { path: string; count?: number; failed?: boolean }
  >();
  private readonly pendingNames = new Set<Vault>();
  private readonly failedNames = new Set<Vault>();
  private readonly failures = new Map<Vault, Partial<Record<VaultSection, string>>>();
  private readonly namePaths = new Map<Vault, string>();
  private readonly tagStates = new Map<Vault, TagState>();
  private readonly parsedTags = new WeakMap<VaultNote, ReturnType<typeof noteTags>>();
  private readonly pendingTagCounts = new Set<Vault>();
  private disposed = false;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly activeVault: () => Vault | undefined,
    private readonly vaults: () => readonly Vault[],
    private readonly tagDiagnostics?: vscode.DiagnosticCollection,
  ) {
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.md");
    this.subscriptions = [
      watcher,
      watcher.onDidCreate((uri) => this.filesChanged(uri)),
      watcher.onDidDelete((uri) => this.filesChanged(uri)),
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      vscode.workspace.onDidChangeTextDocument(() => this.refresh()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("stemlink.showCounts")) this.refresh();
      }),
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
        this.failures.delete(vault);
        this.namePaths.delete(vault);
        const state = this.tagStates.get(vault);
        if (state) this.clearTagDiagnostics(state);
        this.tagStates.delete(vault);
      }
    }

    for (const vault of current) {
      if (!this.vaultSubscriptions.has(vault))
        this.vaultSubscriptions.set(
          vault,
          vault.changed.event(() => {
            this.failures.delete(vault);
            const state = this.tagStates.get(vault);
            if (state) {
              state.summary = undefined;
              if (state.path !== vault.paths.notes.toString()) this.clearTagDiagnostics(state);
            }
            this.refresh();
          }),
        );
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
      void this.captures(vault).then(
        (entries) => {
          if (this.captureCounts.get(vault) !== current) return;
          current.count = entries.length;
          this.refresh();
        },
        (error) => {
          if (this.captureCounts.get(vault) !== current) return;
          current.failed = true;
          reportError(error);
          this.refresh();
        },
      );
    }
    return state.count ?? (state.failed ? "error" : "...");
  }

  private countNotes(vault: Vault): number | string {
    if (this.tagFilter(vault).length) {
      if (vault.indexState === "ready") return this.filteredNotes(vault).length;
      if (vault.indexState === "failed") return "error";
      if (!this.pendingTagCounts.has(vault)) {
        this.pendingTagCounts.add(vault);
        void this.tagChoices(vault).then(
          () => {
            this.pendingTagCounts.delete(vault);
            this.refresh();
          },
          (error: unknown) => {
            this.pendingTagCounts.delete(vault);
            reportError(error);
            this.refresh();
          },
        );
      }
      return "...";
    }
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
      void vault.ensureNames().then(
        () => {
          this.pendingNames.delete(vault);
          this.refresh();
        },
        (error) => {
          this.pendingNames.delete(vault);
          if (vault.paths.notes.toString() === path) {
            this.failedNames.add(vault);
            reportError(error);
          }
          this.refresh();
        },
      );
    }
    return this.failedNames.has(vault) ? "error" : "...";
  }

  tagFilter(vault: Vault): readonly string[] {
    return this.tagStates.get(vault)?.selected ?? [];
  }

  vaultLabel(vault: Vault): string {
    const name = vault.paths.root.path.split("/").pop() || vault.folder.name;
    const duplicates = this.vaults().filter(
      (candidate) => (candidate.paths.root.path.split("/").pop() || candidate.folder.name) === name,
    );
    if (duplicates.length < 2) return name;
    const workspace =
      duplicates.some(
        (candidate) => candidate !== vault && candidate.folder.name === vault.folder.name,
      ) || vault.folder.name === name
        ? vault.folder.uri.fsPath
        : vault.folder.name;
    return `${name} (${workspace})`;
  }

  isVisibleNote(vault: Vault, uri: vscode.Uri): boolean {
    return (
      !this.tagFilter(vault).length ||
      this.filteredNotes(vault).some((note) => note.uri.toString() === uri.toString())
    );
  }

  setTagFilter(vault: Vault, tags: readonly string[]): void {
    const state = this.tagState(vault);
    state.selected = normalizeTags(tags);
    this.refresh();
  }

  private tagState(vault: Vault): TagState {
    let state = this.tagStates.get(vault);
    if (!state) {
      state = { selected: [], path: vault.paths.notes.toString() };
      this.tagStates.set(vault, state);
    } else if (state.path !== vault.paths.notes.toString()) {
      this.clearTagDiagnostics(state);
      state.path = vault.paths.notes.toString();
      state.summary = undefined;
      state.problems = undefined;
    }
    return state;
  }

  private clearTagDiagnostics(state: TagState): void {
    for (const uri of state.diagnosticUris ?? []) this.tagDiagnostics?.delete(uri);
    state.diagnosticUris = [];
  }

  private tagSummary(vault: Vault): TagSummary {
    const state = this.tagState(vault);
    if (state.summary) return state.summary;
    const notes: TagSummary["notes"] = [];
    const counts = new Map<string, number>();
    const problems = new Set<string>();
    const diagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [];
    for (const note of vault.all) {
      let metadata = this.parsedTags.get(note);
      if (!metadata) {
        metadata = noteTags(note.text);
        this.parsedTags.set(note, metadata);
      }
      notes.push({ note, tags: metadata.tags });
      for (const tag of metadata.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      if (metadata.problem) {
        problems.add(note.uri.toString());
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          metadata.problem,
          vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.source = "Stemlink tags";
        diagnostics.push([note.uri, [diagnostic]]);
      }
    }
    for (const uri of state.diagnosticUris ?? []) {
      if (!problems.has(uri.toString())) this.tagDiagnostics?.delete(uri);
    }
    this.tagDiagnostics?.set(diagnostics);
    state.diagnosticUris = diagnostics.map(([uri]) => uri);
    if ([...problems].some((uri) => !state.problems?.has(uri))) {
      void vscode.window
        .showWarningMessage(
          `Stemlink: ${problems.size} ${problems.size === 1 ? "note has" : "notes have"} invalid tag metadata in ${vault.paths.root.fsPath}.`,
          "Show Problems",
        )
        .then((answer) =>
          answer === "Show Problems"
            ? vscode.commands.executeCommand("workbench.actions.view.problems")
            : undefined,
        )
        .then(undefined, reportError);
    }
    state.problems = problems;
    state.summary = { notes, counts };
    return state.summary;
  }

  async tagChoices(vault: Vault): Promise<{ tag: string; count: number }[]> {
    await vault.ensure();
    if (!this.vaults().includes(vault))
      throw new Error("The selected vault is no longer available.");
    const counts = this.tagSummary(vault).counts;
    return normalizeTags([...counts.keys(), ...this.tagFilter(vault)]).map((tag) => ({
      tag,
      count: counts.get(tag) ?? 0,
    }));
  }

  private filteredNotes(vault: Vault): VaultNote[] {
    const selected = new Set(this.tagFilter(vault));
    return this.tagSummary(vault)
      .notes.filter(({ tags }) => tags.some((tag) => selected.has(tag)))
      .map(({ note }) => note);
  }

  refresh(): void {
    if (this.disposed) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      for (const [vault, state] of this.tagStates) {
        if (!state.summary && vault.indexState === "ready") this.tagSummary(vault);
      }
      this.emitter.fire(undefined);
    }, 100);
  }
  reset(vault: Vault): void {
    this.captureCounts.delete(vault);
    this.failedNames.delete(vault);
    this.failures.delete(vault);
    this.refresh();
  }

  message(section: VaultSection): string | undefined {
    const vault = this.activeVault();
    if (section === "Vaults") return undefined;
    if (!vault) return "Open or create a vault in Vaults.";
    if (this.failures.get(vault)?.[section])
      return "Unable to load this view. Use Refresh in Vaults to retry.";
    if (section === "Fleeting") {
      const state = this.captureCounts.get(vault);
      if (state?.failed) return "Unable to load captures. Use Refresh in Vaults to retry.";
      if (state?.count === 0) return "No captures. Use New fleeting note to capture a thought.";
    }
    if (section === "Notes") {
      if (this.failedNames.has(vault) || vault.indexState === "failed")
        return "Unable to load notes. Use Refresh in Vaults to retry.";
      if (this.tagFilter(vault).length) {
        if (vault.indexState === "ready" && !this.filteredNotes(vault).length)
          return "No notes match selected tags. Use Clear tag filter in the view menu.";
      } else if (vault.namesReady && !vault.allTargets.length) {
        return "No permanent notes. Use New permanent note to create one.";
      }
    }
    if (section === "References" && !this.activeNote(vault)) {
      const owner = this.vaults().find((candidate) => this.activeNote(candidate));
      if (owner)
        return `Active note belongs to ${owner.paths.root.fsPath}. Select that vault in Vaults to see references.`;
      return `Open a permanent note in ${vault.paths.root.fsPath} to see references.`;
    }
    return undefined;
  }
  getTreeItem(element: Item): vscode.TreeItem {
    return element;
  }

  private async captures(vault: Vault): Promise<[string, vscode.FileType][]> {
    try {
      return (await vscode.workspace.fs.readDirectory(vault.paths.inbox))
        .filter(
          ([name, type]) =>
            name.endsWith(".md") &&
            !isExcludedNoteFile(name) &&
            Boolean(type & vscode.FileType.File),
        )
        .sort(([a], [b]) => a.localeCompare(b));
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return [];
      throw error;
    }
  }

  private activeNote(vault: Vault): vscode.TextDocument | undefined {
    const document = vscode.window.activeTextEditor?.document;
    const name = document?.uri.path.slice(document.uri.path.lastIndexOf("/") + 1) ?? "";
    return document &&
      directChild(document.uri, vault.paths.notes) &&
      document.uri.path.endsWith(".md") &&
      !isExcludedNoteFile(name)
      ? document
      : undefined;
  }

  private referenceCounts(
    vault: Vault,
    document: vscode.TextDocument | undefined,
  ): { inbound: number | undefined; outbound: number } {
    if (!document) return { inbound: 0, outbound: 0 };
    const name = document.uri.path.slice(document.uri.path.lastIndexOf("/") + 1, -3);
    return {
      inbound: vault.indexState === "ready" ? vault.references(name).length : undefined,
      outbound: linksIn(document.getText()).filter((link) => link.valid).length,
    };
  }

  async getChildren(element?: Item): Promise<Item[]> {
    try {
      const vault = this.activeVault();
      const showCounts = vscode.workspace
        .getConfiguration("stemlink", vault?.paths.root)
        .get<boolean>("showCounts", true);
      const label = (name: string, count: number | string) =>
        showCounts || count === "error" ? `${name} (${count})` : name;
      if (!element) {
        let fleeting: number | string = 0;
        let notes: number | string = 0;
        let references: number | string = 0;
        if (vault) {
          fleeting = this.countCaptures(vault);
          notes = this.countNotes(vault);
          const counts = this.referenceCounts(vault, this.activeNote(vault));
          references =
            counts.inbound === undefined
              ? vault.indexState === "failed"
                ? "error"
                : "..."
              : counts.inbound + counts.outbound;
        }
        return [
          new Item(label("Vaults", this.vaults().length), "Vaults"),
          new Item(
            label(
              vault
                ? vault.paths.inbox.path.slice(vault.paths.inbox.path.lastIndexOf("/") + 1)
                : "Fleeting",
              fleeting,
            ),
            "Fleeting",
          ),
          new Item(
            label(
              vault
                ? vault.paths.notes.path.slice(vault.paths.notes.path.lastIndexOf("/") + 1)
                : "Notes",
              notes,
            ),
            "Notes",
          ),
          new Item(
            vault && this.activeNote(vault) ? label("References", references) : "References",
            "References",
          ),
        ];
      }
      if (element.kind === "Vaults")
        return this.vaults().map((candidate) => {
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
        return (await this.captures(vault)).map(
          ([name]) => new Item(name, "capture", vscode.Uri.joinPath(vault.paths.inbox, name)),
        );
      }
      if (element.kind === "Notes") {
        const filter = this.tagFilter(vault);
        if (filter.length) {
          await vault.ensure();
          if (this.activeVault() !== vault || this.tagFilter(vault) !== filter)
            return this.getChildren(element);
          return this.filteredNotes(vault)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((note) => new Item(note.name, "note", note.uri));
        }
        await vault.ensureNames();
        if (this.activeVault() !== vault || this.tagFilter(vault).length)
          return this.getChildren(element);
        return vault.allTargets
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((note) => new Item(note.name, "note", note.uri));
      }
      const document = this.activeNote(vault);
      if (element.kind === "References") {
        if (!document) return [];
        const counts = this.referenceCounts(vault, document);
        return [
          new Item(
            label("Inbound", counts.inbound ?? (vault.indexState === "failed" ? "error" : "...")),
            "Inbound",
          ),
          new Item(label("Outbound", counts.outbound), "Outbound"),
        ];
      }
      if (!document) return [];
      if (element.kind === "Outbound") {
        await vault.ensureNames();
        return linksIn(document.getText())
          .filter((link) => link.valid)
          .map((link) => {
            const target = vault.target(link.stem);
            const item = new Item(
              link.stem,
              "reference",
              target?.uri ?? document.uri,
              target ? undefined : link.start,
            );
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
        return vault.references(name).map((ref) => {
          const item = new Item(ref.note.name, "reference", ref.note.uri, ref.link.start);
          const before = ref.note.text.slice(0, ref.link.start);
          const line = before.split("\n").length;
          const end = ref.note.text.indexOf("\n", ref.link.start);
          const excerpt = ref.note.text
            .slice(before.lastIndexOf("\n") + 1, end === -1 ? undefined : end)
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80);
          item.description = `${line}: ${excerpt}`;
          item.tooltip = `${ref.note.uri.fsPath}:${line}\n${excerpt}`;
          return item;
        });
      }
      return [];
    } catch (error) {
      const vault = this.activeVault();
      const section =
        element?.kind === "Inbound" || element?.kind === "Outbound" ? "References" : element?.kind;
      if (
        vault &&
        (section === "Vaults" ||
          section === "Fleeting" ||
          section === "Notes" ||
          section === "References")
      ) {
        const failures = this.failures.get(vault) ?? {};
        const message = error instanceof Error ? error.message : String(error);
        if (failures[section] !== message) {
          failures[section] = message;
          this.failures.set(vault, failures);
          reportError(error);
          this.refresh();
        }
      } else reportError(error);
      return [];
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.vaultSubscriptions.forEach((item) => item.dispose());
    this.vaultItems.clear();
    for (const state of this.tagStates.values()) this.clearTagDiagnostics(state);
    this.tagStates.clear();
    this.tagDiagnostics?.dispose();
    this.subscriptions.forEach((item) => item.dispose());
    this.emitter.dispose();
  }
}

export class VaultTreeSection implements vscode.TreeDataProvider<Item>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Item | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly subscription: vscode.Disposable;
  readonly getParent?: (element: Item) => undefined;

  constructor(
    private readonly tree: VaultTree,
    private readonly section: VaultSection,
  ) {
    if (section === "Vaults") this.getParent = () => undefined;
    this.subscription = tree.onDidChangeTreeData(() => this.emitter.fire(undefined));
  }

  getTreeItem(element: Item): vscode.TreeItem {
    return this.tree.getTreeItem(element);
  }

  async getChildren(element?: Item): Promise<Item[]> {
    if (element) return this.tree.getChildren(element);
    const root = (await this.tree.getChildren()).find((item) => item.kind === this.section);
    return root ? this.tree.getChildren(root) : [];
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }
}
