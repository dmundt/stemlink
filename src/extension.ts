import * as vscode from "vscode";
import { auditNotes, linksIn, makeNote, promoteNote, slug, timestamp } from "./core";
import { Item, VaultTree } from "./tree";
import { Vault, directChild, reportError, sameUri, validFolderName } from "./vault";

export function activate(context: vscode.ExtensionContext): void {
  const vaults = new Map<string, Vault>();
  const diagnostics = vscode.languages.createDiagnosticCollection("Stemlink");
  let configuring = false;
  context.subscriptions.push(diagnostics);

  const vaultFor = (uri?: vscode.Uri): Vault | undefined => {
    const folder = uri ? vscode.workspace.getWorkspaceFolder(uri) : undefined;
    const selected = folder ?? vscode.workspace.workspaceFolders?.[0];
    if (!selected) return undefined;
    let vault = vaults.get(selected.uri.toString());
    if (!vault) {
      vault = new Vault(selected);
      vaults.set(selected.uri.toString(), vault);
      context.subscriptions.push(vault);
    }
    return vault;
  };
  for (const folder of vscode.workspace.workspaceFolders ?? []) vaultFor(folder.uri);
  const activeVault = () => vaultFor(vscode.window.activeTextEditor?.document.uri);
  let tree = new VaultTree(activeVault, [...vaults.values()]);
  context.subscriptions.push(tree);
  let treeView = vscode.window.createTreeView("stemlink.vault", { treeDataProvider: tree });
  context.subscriptions.push(treeView);

  const command = <T extends unknown[]>(name: string, handler: (...args: T) => Promise<void>) =>
    context.subscriptions.push(vscode.commands.registerCommand(name, async (...args: unknown[]) => {
      try { await handler(...args as T); } catch (error) { reportError(error); }
    }));

  command("stemlink.openAt", async (uri: vscode.Uri, offset?: number) => {
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    if (offset !== undefined) {
      const position = document.positionAt(offset);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    }
  });

  command("stemlink.createVault", async () => {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) throw new Error("Open a workspace folder first.");
    const selected = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick({ placeHolder: "Choose a workspace for the Zettelkasten" });
    if (!selected) return;
    const config = vscode.workspace.getConfiguration("stemlink", selected.uri);
    const prompt = async (label: string, value: string) => vscode.window.showInputBox({
      title: `Create Zettelkasten: ${label}`, value,
      validateInput: input => validFolderName(input) ? undefined : "Enter a single valid folder name.",
    });
    const root = await prompt("root folder", "zk");
    if (root === undefined) return;
    const inbox = await prompt("inbox folder", "inbox");
    if (inbox === undefined) return;
    const notes = await prompt("notes folder", "notes");
    if (notes === undefined) return;
    if (inbox.toLowerCase() === notes.toLowerCase()) throw new Error("Inbox and notes must be different folders.");
    const rootUri = vscode.Uri.joinPath(selected.uri, root);
    const configured = ["root", "inbox", "notes"].some(key => {
      const info = config.inspect(key);
      return info?.workspaceValue !== undefined || info?.workspaceFolderValue !== undefined;
    });
    let exists = false;
    try { await vscode.workspace.fs.stat(rootUri); exists = true; }
    catch (error) {
      if (!(error instanceof vscode.FileSystemError && error.code === "FileNotFound")) throw error;
    }
    if (exists || configured) {
      const answer = await vscode.window.showWarningMessage(
        "The folder or Stemlink workspace settings already exist. Reuse the folder and replace the Stemlink paths?",
        { modal: true }, "Continue",
      );
      if (answer !== "Continue") return;
    }
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, inbox));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, notes));
    const preserved: string[] = [];
    for (const [name, directory] of [
      ["README.md", rootUri],
      ...["_template.md", "_fleeting.md", "_promotion.md"].map(name => [name, vscode.Uri.joinPath(rootUri, notes)] as const),
    ] as const) {
      const destination = vscode.Uri.joinPath(directory, name);
      const template = vscode.Uri.joinPath(context.extensionUri, "templates", name);
      try {
        await vscode.workspace.fs.copy(template, destination, { overwrite: false });
      } catch (error) {
        if (!(error instanceof vscode.FileSystemError && error.code === "FileExists")) throw error;
        if (!((await vscode.workspace.fs.stat(destination)).type & vscode.FileType.File)) {
          throw new Error(`The vault's ${name} exists but is not a file.`);
        }
        preserved.push(name);
      }
    }
    const target = folders.length > 1 ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Workspace;
    const keys = ["root", "inbox", "notes"] as const;
    const values = [root, inbox, notes];
    const previous = keys.map(key => {
      const inspected = config.inspect<string>(key);
      return target === vscode.ConfigurationTarget.WorkspaceFolder ? inspected?.workspaceFolderValue : inspected?.workspaceValue;
    });
    configuring = true;
    try {
      for (let i = 0; i < keys.length; i++) await config.update(keys[i], values[i], target);
    } catch (error) {
      try {
        for (let i = 0; i < keys.length; i++) await config.update(keys[i], previous[i], target);
      } catch (rollbackError) {
        throw new Error(`Could not save vault settings: ${String(error)}. Settings rollback also failed: ${String(rollbackError)}`);
      }
      throw error;
    } finally {
      configuring = false;
    }
    await vaultFor(selected.uri)?.configurationChanged();
    tree.refresh();
    if (preserved.length) void vscode.window.showWarningMessage(`Stemlink: Zettelkasten ready; existing ${preserved.join(", ")} ${preserved.length === 1 ? "was" : "were"} preserved.`);
    else void vscode.window.showInformationMessage("Stemlink: Zettelkasten ready.");
  });

  async function askMetadata(defaultTitle = ""): Promise<{ title: string; tags: string[] } | undefined> {
    const title = await vscode.window.showInputBox({
      title: "Note title", value: defaultTitle,
      validateInput: value => value.trim() ? undefined : "Enter a title.",
    });
    if (title === undefined) return undefined;
    const rawTags = await vscode.window.showInputBox({ title: "Tags (comma-separated, optional)" });
    if (rawTags === undefined) return undefined;
    return { title: title.trim(), tags: rawTags.split(",").map(tag => tag.trim()).filter(Boolean) };
  }

  async function createFile(directory: vscode.Uri, title: string, text: string): Promise<vscode.Uri> {
    const base = `${timestamp(new Date())}-${slug(title)}`;
    for (let suffix = 1; ; suffix++) {
      const uri = vscode.Uri.joinPath(directory, `${base}${suffix === 1 ? "" : `-${suffix}`}.md`);
      try {
        await vscode.workspace.fs.stat(uri);
        continue;
      } catch (error) {
        if (!(error instanceof vscode.FileSystemError && error.code === "FileNotFound")) throw error;
      }
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, { overwrite: false, ignoreIfExists: false });
      edit.insert(uri, new vscode.Position(0, 0), text);
      if (!await vscode.workspace.applyEdit(edit)) throw new Error("Could not create the note; no existing file was overwritten.");
      const doc = await vscode.workspace.openTextDocument(uri);
      if (!await doc.save()) throw new Error(`Created ${uri.path} but could not save it.`);
      return uri;
    }
  }

  command("stemlink.addFleetingNote", async () => {
    const vault = activeVault();
    if (!vault) throw new Error("Open a workspace folder first.");
    const template = vscode.Uri.joinPath(vault.paths.notes, "_fleeting.md");
    let text: string;
    try {
      text = Buffer.from(await vscode.workspace.fs.readFile(template)).toString("utf8");
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
        throw new Error(`Fleeting template not found at ${template.path}. Create _fleeting.md in the notes folder.`);
      }
      throw error;
    }
    const uri = await createFile(vault.paths.inbox, "capture", text);
    tree.refresh();
    await vscode.window.showTextDocument(uri);
  });

  command("stemlink.addNote", async () => {
    const vault = activeVault();
    if (!vault) throw new Error("Open a workspace folder first.");
    const metadata = await askMetadata();
    if (!metadata) return;
    const uri = await createFile(vault.paths.notes, metadata.title, makeNote(metadata.title, metadata.tags));
    await vault.refresh();
    await vscode.window.showTextDocument(uri);
  });

  command("stemlink.promote", async (item?: Item) => {
    const uri = item?.uri ?? vscode.window.activeTextEditor?.document.uri;
    const vault = vaultFor(uri);
    if (!vault || !uri || !directChild(uri, vault.paths.inbox) || !uri.path.endsWith(".md")) {
      throw new Error("Select an inbox Markdown capture to promote.");
    }
    const name = uri.path.slice(uri.path.lastIndexOf("/") + 1, -3).replace(/^\d{12}-/, "").replace(/-/g, " ");
    const metadata = await askMetadata(name);
    if (!metadata) return;
    const doc = await vscode.workspace.openTextDocument(uri);
    if (doc.isDirty && !await doc.save()) throw new Error("Could not save the capture; promotion cancelled.");
    const snapshot = doc.getText();
    const originalBytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
    const text = promoteNote(snapshot, metadata.title, metadata.tags);
    const target = await createFile(vault.paths.notes, metadata.title, text);
    try {
      const currentBytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
      if (doc.getText() !== snapshot || !currentBytes.equals(originalBytes)) {
        throw new Error("capture changed during promotion and was retained");
      }
      await vscode.workspace.fs.delete(uri);
    }
    catch (error) {
      throw new Error(`Note created at ${target.path}, but capture could not be removed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await vault.refresh();
    tree.refresh();
    await vscode.window.showTextDocument(target);
  });

  command("stemlink.refresh", async () => {
    const vault = activeVault();
    if (!vault) throw new Error("Open a workspace folder first.");
    await vault.refresh();
    tree.refresh();
  });

  command("stemlink.checkReferences", async () => {
    const vault = activeVault();
    if (!vault) throw new Error("Open a workspace folder first.");
    diagnostics.clear();
    await vault.refresh();
    const notes = vault.all.filter(note => !note.name.startsWith("_"));
    const findings = auditNotes(notes);
    const grouped = new Map<string, vscode.Diagnostic[]>();
    for (const finding of findings) {
      const positionAt = (offset: number) => {
        const prefix = finding.note.text.slice(0, offset);
        return new vscode.Position(prefix.split("\n").length - 1, offset - (prefix.lastIndexOf("\n") + 1));
      };
      const range = new vscode.Range(positionAt(finding.start), positionAt(finding.end));
      const severity = finding.severity === "error" ? vscode.DiagnosticSeverity.Error
        : finding.severity === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
      const diagnostic = new vscode.Diagnostic(range, finding.message, severity);
      diagnostic.source = "Stemlink";
      const list = grouped.get(finding.note.uri.toString()) ?? [];
      list.push(diagnostic);
      grouped.set(finding.note.uri.toString(), list);
    }
    for (const note of notes) {
      const list = grouped.get(note.uri.toString());
      if (list) diagnostics.set(note.uri, list);
    }
    const count = (severity: string) => findings.filter(finding => finding.severity === severity).length;
    void vscode.window.showInformationMessage(`Stemlink: ${count("error")} errors, ${count("warning")} warnings, ${count("info")} info across ${notes.length} notes.`);
  });

  const selector: vscode.DocumentSelector = [{ language: "markdown" }];
  const linkAt = (document: vscode.TextDocument, position: vscode.Position) => {
    const offset = document.offsetAt(position);
    return linksIn(document.getText()).find(link => link.valid && link.start <= offset && offset < link.end);
  };
  context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, {
    async provideDocumentLinks(document) {
      const vault = vaultFor(document.uri);
      if (!vault) return [];
      await vault.ensureNames();
      return linksIn(document.getText()).flatMap(link => {
        const target = link.valid ? vault.target(link.stem) : undefined;
        return target ? [new vscode.DocumentLink(new vscode.Range(document.positionAt(link.start), document.positionAt(link.end)), target.uri)] : [];
      });
    },
  }));
  context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, {
    async provideDefinition(document, position) {
      const vault = vaultFor(document.uri);
      const link = linkAt(document, position);
      if (!vault || !link) return undefined;
      await vault.ensureNames();
      const target = vault.target(link.stem);
      return target ? new vscode.Location(target.uri, new vscode.Position(0, 0)) : undefined;
    },
  }));
  context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, {
    async provideReferences(document, position) {
      const vault = vaultFor(document.uri);
      if (!vault) return [];
      await vault.ensure();
      const link = linkAt(document, position);
      if (!link && !directChild(document.uri, vault.paths.notes)) return [];
      const name = document.uri.path.slice(document.uri.path.lastIndexOf("/") + 1);
      const stem = link?.stem ?? (name.endsWith(".md") ? name.slice(0, -3) : "");
      return vault.references(stem).map(ref => {
        const prefix = ref.note.text.slice(0, ref.link.start);
        const line = prefix.split("\n").length - 1;
        const character = ref.link.start - (prefix.lastIndexOf("\n") + 1);
        return new vscode.Location(ref.note.uri, new vscode.Position(line, character));
      });
    },
  }));
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, {
    async provideCompletionItems(document, position) {
      const line = document.lineAt(position.line).text;
      const before = line.slice(0, position.character);
      const match = /\[\[([^\]\[\r\n]*)$/.exec(before);
      if (!match) return [];
      const vault = vaultFor(document.uri);
      if (!vault) return [];
      await vault.ensureNames();
      const closes = line.slice(position.character).startsWith("]]");
      return vault.allTargets.filter(note => !sameUri(note.uri, document.uri)).map(note => {
        const item = new vscode.CompletionItem(note.stem, vscode.CompletionItemKind.Reference);
        item.insertText = `${note.stem}${closes ? "" : "]]"}`;
        item.range = new vscode.Range(position.line, position.character - match[1].length, position.line, position.character);
        return item;
      });
    },
  }, "["));

  context.subscriptions.push(vscode.workspace.onDidRenameFiles(event => {
    for (const file of event.files) {
      const vault = vaultFor(file.oldUri);
      if (vault && ((directChild(file.oldUri, vault.paths.notes) && file.oldUri.path.endsWith(".md")) ||
          sameUri(file.oldUri, vault.paths.notes) || sameUri(file.oldUri, vault.paths.root))) {
        void vscode.window.showWarningMessage("Stemlink: a permanent note or vault folder was renamed. References may be broken; run Check References.");
      }
    }
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (!configuring && event.affectsConfiguration("stemlink")) {
      for (const vault of vaults.values()) void vault.configurationChanged().catch(reportError);
      tree.refresh();
    }
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
    const activeFolders = new Set((vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.toString()));
    for (const [key, vault] of vaults) {
      if (!activeFolders.has(key)) {
        vault.dispose();
        vaults.delete(key);
      }
    }
    for (const folder of vscode.workspace.workspaceFolders ?? []) vaultFor(folder.uri);
    treeView.dispose();
    tree.dispose();
    tree = new VaultTree(activeVault, [...vaults.values()]);
    treeView = vscode.window.createTreeView("stemlink.vault", { treeDataProvider: tree });
    context.subscriptions.push(tree, treeView);
  }));
}

export function deactivate(): void {}
