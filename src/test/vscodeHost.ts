import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import * as os from "node:os";
import * as vscode from "vscode";
import { Vault, directChild, pathsFor, validFolderName } from "../vault";
import { VaultTree } from "../tree";

async function waitFor(condition: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

async function testVirtualVault(): Promise<void> {
  const changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  const stem = "202601021200-virtual";
  let text = `---\ntitle: Virtual\ntags: []\n---\n\n[[${stem}]]\n`;
  let state: "denied" | "missing" | "ready" = "denied";
  let gate: { started: () => void; release: Promise<void>; missing: boolean } | undefined;
  const provider: vscode.FileSystemProvider = {
    onDidChangeFile: changes.event,
    watch: () => new vscode.Disposable(() => {}),
    stat: () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: Buffer.byteLength(text) }),
    readDirectory: () => {
      if (state === "denied") throw vscode.FileSystemError.NoPermissions("Cannot read notes");
      if (state === "missing") throw vscode.FileSystemError.FileNotFound("Missing folder");
      return [[`${stem}.md`, vscode.FileType.File]];
    },
    readFile: async () => {
      if (state === "denied") throw vscode.FileSystemError.NoPermissions("Cannot read note file");
      const snapshot = text;
      const current = gate;
      if (current) {
        gate = undefined;
        current.started();
        await current.release;
        if (current.missing) throw vscode.FileSystemError.FileNotFound();
      }
      return Buffer.from(snapshot);
    },
    createDirectory: () => { throw vscode.FileSystemError.NoPermissions(); },
    writeFile: () => { throw vscode.FileSystemError.NoPermissions(); },
    delete: () => { throw vscode.FileSystemError.NoPermissions(); },
    rename: () => { throw vscode.FileSystemError.NoPermissions(); },
  };
  const registration = vscode.workspace.registerFileSystemProvider("stemlink-test", provider, { isReadonly: true });
  const folder: vscode.WorkspaceFolder = { uri: vscode.Uri.parse("stemlink-test:/workspace"), name: "virtual", index: 0 };
  const vault = new Vault(folder);
  try {
    await assert.rejects(() => vault.ensure(), /Cannot read notes/);
    state = "ready";
    await vault.ensure();
    assert.equal(vault.get(stem)?.text, text, "virtual note content was not indexed");
    assert.equal(vault.references(stem).length, 1, "virtual note reference was not indexed");
    text = "---\ntitle: Changed\ntags: []\n---\n\nNo links\n";
    changes.fire([{ type: vscode.FileChangeType.Changed, uri: vscode.Uri.joinPath(vault.paths.notes, `${stem}.md`) }]);
    await waitFor(() => vault.get(stem)?.text === text && vault.references(stem).length === 0,
      "virtual file change did not update the index");
    for (const missing of [false, true]) {
      let started!: () => void;
      let resume!: () => void;
      const begun = new Promise<void>(resolve => { started = resolve; });
      const release = new Promise<void>(resolve => { resume = resolve; });
      gate = { started, release, missing };
      const refresh = vault.refresh();
      try {
        await waitFor(() => gate === undefined, "refresh did not start reading the virtual note");
        await begun;
        text = `---\ntitle: ${missing ? "Missing race" : "Edit race"}\ntags: []\n---\n\n[[${stem}]]\n`;
        changes.fire([{ type: vscode.FileChangeType.Changed, uri: vscode.Uri.joinPath(vault.paths.notes, `${stem}.md`) }]);
        await waitFor(() => vault.get(stem)?.text === text, "concurrent edit was not indexed");
      } finally {
        resume();
      }
      await refresh;
      assert.equal(vault.get(stem)?.text, text, "refresh published stale content after a concurrent edit");
      assert.equal(vault.references(stem).length, 1, "refresh lost a concurrent reference");
    }
    state = "missing";
    const emptyVault = new Vault(folder);
    const emptyTree = new VaultTree(() => emptyVault, [emptyVault]);
    try {
      await emptyVault.ensure();
      assert.equal(emptyVault.all.length, 0, "missing notes folder was not treated as empty");
      const sections = await emptyTree.getChildren();
      assert.deepEqual(await emptyTree.getChildren(sections[0]), [], "missing inbox was not treated as empty");
      const errorApi = vscode.window as { showErrorMessage: typeof vscode.window.showErrorMessage };
      const originalError = errorApi.showErrorMessage;
      const errors: string[] = [];
      errorApi.showErrorMessage = new Proxy(originalError, {
        apply: (_target, _thisArg, args: unknown[]) => {
          errors.push(String(args[0]));
          return Promise.resolve(undefined);
        },
      });
      try {
        state = "denied";
        assert.deepEqual(await emptyTree.getChildren(sections[0]), []);
        assert.ok(errors.some(message => message.includes("Cannot read notes")), "tree hid a directory read error");
        changes.fire([{ type: vscode.FileChangeType.Changed, uri: vscode.Uri.joinPath(vault.paths.notes, `${stem}.md`) }]);
        await waitFor(() => errors.some(message => message.includes("Cannot read note file")), "watcher hid a file read error");
      } finally {
        errorApi.showErrorMessage = originalError;
      }
    } finally {
      emptyTree.dispose();
      emptyVault.dispose();
    }
  } finally {
    vault.dispose();
    registration.dispose();
    changes.dispose();
  }
}

async function testMultiRoot(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  assert.equal(folders?.length, 2, "multi-root fixture missing");
  assert.ok(folders);
  const api = vscode.window as {
    showInputBox: typeof vscode.window.showInputBox;
    showWorkspaceFolderPick: typeof vscode.window.showWorkspaceFolderPick;
  };
  const originalInput = api.showInputBox;
  const originalPicker = api.showWorkspaceFolderPick;
  const answers = ["second-vault", "captures", "permanent"];
  try {
    api.showInputBox = async () => {
      assert.ok(answers.length, "unexpected input prompt");
      return answers.shift();
    };
    api.showWorkspaceFolderPick = async () => undefined;
    await vscode.commands.executeCommand("stemlink.createVault");
    assert.equal(answers.length, 3, "cancelled workspace picker prompted for folders");
    api.showWorkspaceFolderPick = async () => folders[1];
    await vscode.commands.executeCommand("stemlink.createVault");
    assert.equal(answers.length, 0);
    const notes = vscode.Uri.joinPath(folders[1].uri, "second-vault", "permanent");
    assert.ok((await vscode.workspace.fs.stat(notes)).type & vscode.FileType.Directory);
    assert.equal(vscode.workspace.getConfiguration("stemlink", folders[1].uri).get("root"), "second-vault");
    assert.equal(vscode.workspace.getConfiguration("stemlink", folders[0].uri).get("root"), "zk",
      "creating a second vault changed the first workspace's settings");
    const third = vscode.Uri.joinPath(folders[1].uri, "additional-workspace");
    await vscode.workspace.fs.createDirectory(third);
    const changeFolders = async (remove: boolean) => {
      let subscription: vscode.Disposable | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const changed = new Promise<void>((resolve, reject) => {
        subscription = vscode.workspace.onDidChangeWorkspaceFolders(() => resolve());
        timer = setTimeout(() => reject(new Error("Workspace folder change timed out")), 5000);
      });
      try {
        assert.equal(remove ? vscode.workspace.updateWorkspaceFolders(2, 1)
          : vscode.workspace.updateWorkspaceFolders(2, 0, { uri: third }), true);
        await changed;
      } finally {
        subscription?.dispose();
        if (timer) clearTimeout(timer);
      }
    };
    await changeFolders(false);
    await changeFolders(true);
    assert.equal(vscode.workspace.getConfiguration("stemlink", folders[1].uri).get("root"), "second-vault");
  } finally {
    api.showInputBox = originalInput;
    api.showWorkspaceFolderPick = originalPicker;
  }
}

export async function run(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "test workspace missing");
  const extension = vscode.extensions.getExtension("dmundt.stemlink");
  assert.ok(extension, "development extension missing");
  await extension.activate();
  if (process.env.STEMLINK_MULTI_ROOT === "1") {
    await testMultiRoot();
    return;
  }
  const notes = vscode.Uri.joinPath(folder.uri, "zk", "notes");
  const first = vscode.Uri.joinPath(notes, "202601011200-note-0.md");
  const second = vscode.Uri.joinPath(notes, "202601011200-note-1.md");
  if (process.env.STEMLINK_BENCHMARK !== "1") {
    await testVirtualVault();
    for (const name of ["", ".", "..", " note", "note ", "note.", "a/b", "a\\b", "a:b", "a?b"]) {
      assert.equal(validFolderName(name), false, `accepted invalid folder name ${JSON.stringify(name)}`);
    }
    assert.equal(validFolderName("notes-2026"), true);
    assert.equal(directChild(first, notes), true);
    assert.equal(directChild(vscode.Uri.joinPath(notes, "nested", "note.md"), notes), false);
    const configApi = vscode.workspace as { getConfiguration: typeof vscode.workspace.getConfiguration };
    const originalConfig = configApi.getConfiguration;
    let badNames: Record<string, string> = { root: "../outside" };
    configApi.getConfiguration = new Proxy(originalConfig, {
      apply: (target, thisArg, args: Parameters<typeof vscode.workspace.getConfiguration>) => {
        const config = Reflect.apply(target, thisArg, args) as vscode.WorkspaceConfiguration;
        if (args[0] !== "stemlink") return config;
        return { get: (key: string, fallback: unknown) => badNames[key] ?? config.get(key, fallback) };
      },
    });
    try {
      assert.throws(() => pathsFor(folder), /valid folder names/);
      badNames = { inbox: "same", notes: "SAME" };
      assert.throws(() => pathsFor(folder), /distinct valid folder names/);
    } finally {
      configApi.getConfiguration = originalConfig;
    }
  }
  const document = await vscode.workspace.openTextDocument(first);
  await vscode.window.showTextDocument(document);
  const offset = document.getText().indexOf("[[202601011200-note-1]]");
  assert.ok(offset >= 0);
  const position = document.positionAt(offset + 3);

  let started = performance.now();
  const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>("vscode.executeLinkProvider", first);
  const indexingMs = performance.now() - started;
  assert.ok(links?.some(link => link.target?.toString() === second.toString()), "document link does not resolve");
  const definitions = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeDefinitionProvider", first, position);
  assert.ok(definitions?.some(location => location.uri.toString() === second.toString()), "definition does not resolve");

  const directVault = new Vault(folder);
  const openDocuments = vscode.workspace.textDocuments.length;
  const cpuStart = process.cpuUsage();
  started = performance.now();
  await directVault.ensure();
  assert.ok(directVault.references("202601011200-note-1").some(ref => ref.note.uri.toString() === first.toString()));
  const directBacklinksMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuStart);
  const directBacklinksCpuMs = (cpu.user + cpu.system) / 1000;
  if (process.env.STEMLINK_BENCHMARK === "1") {
    assert.equal(directVault.all.length, 10_000, "benchmark index omitted notes");
    for (let i = 0; i < 10_000; i++) {
      const incoming = directVault.references(`202601011200-note-${i}`);
      assert.equal(incoming.length, 1, `benchmark backlinks incomplete for note ${i}`);
      assert.equal(incoming[0].note.stem, `202601011200-note-${(i + 9999) % 10_000}`);
    }
  }
  directVault.dispose();

  started = performance.now();
  const references = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeReferenceProvider", first, position);
  const referencesMs = performance.now() - started;
  assert.ok(references?.some(reference => reference.uri.toString() === first.toString()), "backlink missing");
  if (process.env.STEMLINK_BENCHMARK !== "1") {
    assert.ok(references?.some(reference => reference.uri.toString() === first.toString() && reference.range.start.isEqual(document.positionAt(offset))),
      "backlink location did not point to the reference");
    const noteReferences = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider", first, new vscode.Position(0, 0),
    );
    assert.ok(noteReferences?.some(reference => reference.uri.path.endsWith("202601011200-note-2.md")),
      "backlinks to current note missing");
  }

  const edit = new vscode.WorkspaceEdit();
  edit.insert(first, document.positionAt(document.getText().length), "\n[[202601011200-note-");
  assert.equal(await vscode.workspace.applyEdit(edit), true);
  started = performance.now();
  const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider", first, document.positionAt(document.getText().length), "[",
  );
  const completionMs = performance.now() - started;
  const completion = completions?.items.find(item => item.label === "202601011200-note-1");
  assert.ok(completion, "completion missing");
  assert.ok(typeof completion.insertText === "string");
  assert.ok(completion.range instanceof vscode.Range);
  const completionEdit = new vscode.WorkspaceEdit();
  completionEdit.replace(first, completion.range, completion.insertText);
  assert.equal(await vscode.workspace.applyEdit(completionEdit), true);
  assert.ok(document.getText().endsWith("[[202601011200-note-1]]"), "completion did not create a valid link");

  const replacement = new vscode.WorkspaceEdit();
  replacement.insert(first, document.positionAt(document.getText().length), "\n[[bad target]]\n[[202601011200-missing]]");
  assert.equal(await vscode.workspace.applyEdit(replacement), true);
  await vscode.commands.executeCommand("stemlink.checkReferences");
  assert.ok(vscode.languages.getDiagnostics(first).some(diagnostic => diagnostic.source === "Stemlink" && diagnostic.message === "Malformed reference."),
    "manual audit did not use unsaved content");

  if (process.env.STEMLINK_BENCHMARK !== "1") {
    const updatedLinks = await vscode.commands.executeCommand<vscode.DocumentLink[]>("vscode.executeLinkProvider", first);
    assert.ok(!updatedLinks?.some(link => link.target?.path.endsWith("202601011200-missing.md")),
      "missing reference was made navigable");
    const missingPosition = document.positionAt(document.getText().lastIndexOf("[[202601011200-missing]]") + 4);
    const missingDefinitions = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeDefinitionProvider", first, missingPosition);
    assert.ok(!missingDefinitions?.some(location => location.uri.path.endsWith("202601011200-missing.md")),
      "missing reference resolved to a guessed target");

    const completionInput = new vscode.WorkspaceEdit();
    completionInput.insert(first, document.positionAt(document.getText().length), "\n[[202601011200-no]]");
    assert.equal(await vscode.workspace.applyEdit(completionInput), true);
    const insideClosing = document.positionAt(document.getText().length - 2);
    const closingCompletions = await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider", first, insideClosing, "[",
    );
    const closingCompletion = closingCompletions?.items.find(item => item.label === "202601011200-note-1");
    assert.equal(closingCompletion?.insertText, "202601011200-note-1", "completion duplicated existing closing brackets");
    assert.ok(!closingCompletions?.items.some(item => item.label === "202601011200-note-0"),
      "completion included the current note");
  }

  const vault = new Vault(folder);
  const tree = new VaultTree(() => vault, [vault]);
  try {
    started = performance.now();
    await vault.ensure();
    const independentIndexMs = performance.now() - started;
    const sections = await tree.getChildren();
    assert.deepEqual(sections.map(item => item.label), ["Inbox", "Notes", "Ref From", "Ref To"]);
    assert.equal(sections[0].tooltip, "Unprocessed captures.");
    assert.equal(sections[0].contextValue, "stemlink.inbox");
    const outgoing = await tree.getChildren(sections[2]);
    assert.ok(outgoing.some(item => item.label === "202601011200-note-1"),
      "tree outgoing reference missing");
    const missing = outgoing.find(item => item.label === "202601011200-missing");
    assert.ok(missing?.iconPath instanceof vscode.ThemeIcon && missing.iconPath.id === "warning");
    assert.equal(missing.tooltip, "No note found for 202601011200-missing.");
    const incoming = await tree.getChildren(sections[3]);
    const incomingName = process.env.STEMLINK_BENCHMARK === "1" ? "202601011200-note-9999.md" : "202601011200-note-2.md";
    assert.ok(incoming.some(item => item.label === incomingName), "tree incoming reference missing");
    if (process.env.STEMLINK_BENCHMARK !== "1") {
      assert.equal(vault.get("202601011200-note-0")?.text, document.getText(), "index ignored unsaved text");
      const previousText = document.getText();
      const change = new vscode.WorkspaceEdit();
      change.insert(first, document.positionAt(previousText.length), "\n[[202601011200-note-2]]");
      assert.equal(await vscode.workspace.applyEdit(change), true);
      assert.ok(vault.references("202601011200-note-2").some(ref => ref.note.uri.toString() === first.toString()),
        "index did not add an unsaved reference");
      await vault.refresh();
      assert.ok(vault.references("202601011200-note-2").some(ref => ref.note.uri.toString() === first.toString()),
        "refresh lost an unsaved reference");
      const undo = new vscode.WorkspaceEdit();
      undo.delete(first, new vscode.Range(document.positionAt(previousText.length), document.positionAt(document.getText().length)));
      assert.equal(await vscode.workspace.applyEdit(undo), true);
      assert.ok(!vault.references("202601011200-note-2").some(ref => ref.note.uri.toString() === first.toString()),
        "index kept a removed unsaved reference");
    }
    started = performance.now();
    const treeNotes = await tree.getChildren(sections[1]);
    const treeMs = performance.now() - started;
    assert.equal(treeNotes.length, process.env.STEMLINK_BENCHMARK === "1" ? 10_000 : 3);
    if (process.env.STEMLINK_BENCHMARK !== "1") {
      assert.deepEqual(await tree.getChildren(treeNotes[0]), [], "leaf note unexpectedly had children");
    }
    started = performance.now();
    tree.refresh();
    await tree.getChildren(sections[1]);
    const treeRefreshMs = performance.now() - started;
    started = performance.now();
    await vscode.commands.executeCommand("stemlink.checkReferences");
    const auditMs = performance.now() - started;
    console.log(JSON.stringify({
      scenario: process.env.STEMLINK_BENCHMARK === "1" ? "10000-note VS Code host" : "VS Code integration",
      fixture: "small Markdown notes with YAML title, tag, and one outgoing reference",
      markdownProviderDisabled: process.env.STEMLINK_DISABLE_MARKDOWN_PROVIDER === "1",
      openDocuments,
      platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model,
      vscode: vscode.version, node: process.version,
      firstLinkAndIndexMs: Math.round(indexingMs), independentIndexMs: Math.round(independentIndexMs),
      notesTreeMs: Math.round(treeMs), notesTreeRefreshMs: Math.round(treeRefreshMs), completionMs: Math.round(completionMs),
      directBacklinksMs: Math.round(directBacklinksMs), directBacklinksCpuMs: Math.round(directBacklinksCpuMs),
      nativeReferencesMs: Math.round(referencesMs), auditMs: Math.round(auditMs),
    }));
  } finally {
    tree.dispose();
    vault.dispose();
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
  }
  if (process.env.STEMLINK_BENCHMARK !== "1") {
    const windowApi = vscode.window as { showInputBox: typeof vscode.window.showInputBox };
    const originalInput = windowApi.showInputBox;
    const answers: (string | undefined)[] = [];
    const defaults: (string | undefined)[] = [];
    windowApi.showInputBox = async options => {
      assert.ok(answers.length, "unexpected input prompt");
      defaults.push(options?.value);
      return answers.shift();
    };
    try {
      answers.push("custom-vault", "captures", "permanent");
      await vscode.commands.executeCommand("stemlink.createVault");
      assert.deepEqual(defaults, ["zk", "inbox", "notes"]);
      const inbox = vscode.Uri.joinPath(folder.uri, "custom-vault", "captures");
      const permanent = vscode.Uri.joinPath(folder.uri, "custom-vault", "permanent");
      const manual = vscode.Uri.joinPath(folder.uri, "custom-vault", "README.md");
      assert.ok((await vscode.workspace.fs.stat(inbox)).type & vscode.FileType.Directory);
      assert.ok((await vscode.workspace.fs.stat(permanent)).type & vscode.FileType.Directory);
      assert.deepEqual(
        await vscode.workspace.fs.readFile(manual),
        await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extension.extensionUri, "templates", "README.md")),
        "vault manual does not match the template",
      );
      const templateNames = ["_template.md", "_fleeting.md", "_promotion.md"];
      for (const name of templateNames) {
        assert.deepEqual(
          await vscode.workspace.fs.readFile(vscode.Uri.joinPath(permanent, name)),
          await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extension.extensionUri, "templates", name)),
          `${name} does not match the template`,
        );
      }
      assert.equal(vscode.workspace.getConfiguration("stemlink", folder.uri).get("root"), "custom-vault");

      await vscode.workspace.fs.writeFile(manual, Buffer.from("Existing manual\n"));
      const noteTemplate = vscode.Uri.joinPath(permanent, "_template.md");
      await vscode.workspace.fs.writeFile(noteTemplate, Buffer.from("Existing template\n"));
      const reuseWarningApi = vscode.window as { showWarningMessage: typeof vscode.window.showWarningMessage };
      const originalReuseWarning = reuseWarningApi.showWarningMessage;
      const reuseWarnings: string[] = [];
      reuseWarningApi.showWarningMessage = new Proxy(originalReuseWarning, {
        apply: (_target, _thisArg, args: unknown[]) => {
          reuseWarnings.push(String(args[0]));
          return Promise.resolve(args[2] === "Continue" ? "Continue" : undefined);
        },
      });
      try {
        answers.push("custom-vault", "captures", "permanent");
        await vscode.commands.executeCommand("stemlink.createVault");
      } finally {
        reuseWarningApi.showWarningMessage = originalReuseWarning;
      }
      assert.equal(Buffer.from(await vscode.workspace.fs.readFile(manual)).toString("utf8"), "Existing manual\n",
        "reusing a vault overwrote its manual");
      assert.equal(Buffer.from(await vscode.workspace.fs.readFile(noteTemplate)).toString("utf8"), "Existing template\n",
        "reusing a vault overwrote its template");
      assert.ok(reuseWarnings.some(message => message.includes("README.md") && templateNames.every(name => message.includes(name))),
        "preserved files were not reported");

      const validationApi = vscode.window as { showErrorMessage: typeof vscode.window.showErrorMessage };
      const originalValidationError = validationApi.showErrorMessage;
      const validationErrors: string[] = [];
      validationApi.showErrorMessage = new Proxy(originalValidationError, {
        apply: (_target, _thisArg, args: unknown[]) => {
          validationErrors.push(String(args[0]));
          return Promise.resolve(undefined);
        },
      });
      try {
        answers.push("invalid-vault", "same", "SAME");
        await vscode.commands.executeCommand("stemlink.createVault");
        assert.ok(validationErrors.some(message => message.includes("Inbox and notes must be different folders")),
          "duplicate folder names were accepted");
        await assert.rejects(async () => vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, "invalid-vault")));
        answers.push(undefined);
        await vscode.commands.executeCommand("stemlink.createVault");
        answers.push("cancelled-vault", undefined);
        await vscode.commands.executeCommand("stemlink.createVault");
        answers.push("cancelled-vault", "captures", undefined);
        await vscode.commands.executeCommand("stemlink.createVault");
        await assert.rejects(async () => vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, "cancelled-vault")));
        assert.equal(vscode.workspace.getConfiguration("stemlink", folder.uri).get("root"), "custom-vault",
          "cancelled creation changed settings");
        await vscode.commands.executeCommand("stemlink.promote", { uri: manual });
        assert.ok(validationErrors.some(message => message.includes("Select an inbox Markdown capture")),
          "promotion accepted a file outside the inbox");

        const warningApi = vscode.window as { showWarningMessage: typeof vscode.window.showWarningMessage };
        const previousWarning = warningApi.showWarningMessage;
        warningApi.showWarningMessage = new Proxy(previousWarning, {
          apply: () => Promise.resolve(undefined),
        });
        try {
          answers.push("custom-vault", "captures", "permanent");
          await vscode.commands.executeCommand("stemlink.createVault");
          assert.equal(Buffer.from(await vscode.workspace.fs.readFile(manual)).toString("utf8"), "Existing manual\n",
            "declining reuse changed the manual");
        } finally {
          warningApi.showWarningMessage = previousWarning;
        }

        const workspaceApi = vscode.workspace as { getConfiguration: typeof vscode.workspace.getConfiguration };
        const originalConfig = workspaceApi.getConfiguration;
        const previousReuseWarning = warningApi.showWarningMessage;
        let injectFailure = true;
        let injectRollbackFailure = false;
        workspaceApi.getConfiguration = new Proxy(originalConfig, {
          apply: (target, thisArg, args: Parameters<typeof vscode.workspace.getConfiguration>) => {
            const config = Reflect.apply(target, thisArg, args) as vscode.WorkspaceConfiguration;
            if (args[0] !== "stemlink") return config;
            return {
              get: config.get.bind(config),
              has: config.has.bind(config),
              inspect: config.inspect.bind(config),
              update: async (key: string, value: unknown, target?: vscode.ConfigurationTarget | boolean) => {
                if (injectRollbackFailure && key === "root" && value === "custom-vault") {
                  throw new Error("Injected rollback failure");
                }
                if (injectFailure && key === "inbox") {
                  injectFailure = false;
                  throw new Error("Injected settings failure");
                }
                await config.update(key, value, target);
              },
            };
          },
        });
        warningApi.showWarningMessage = new Proxy(previousReuseWarning, {
          apply: (_target, _thisArg, args: unknown[]) => Promise.resolve(args[2] === "Continue" ? "Continue" : undefined),
        });
        try {
          answers.push("rollback-vault", "captures", "permanent");
          await vscode.commands.executeCommand("stemlink.createVault");
          assert.ok(validationErrors.some(message => message.includes("Injected settings failure")),
            `settings failure was not reported: ${validationErrors.join("; ")}`);
          const restored = originalConfig("stemlink", folder.uri);
          assert.equal(restored.get("root"), "custom-vault", "failed creation did not restore root setting");
          assert.equal(restored.get("inbox"), "captures", "failed creation did not restore inbox setting");
          assert.equal(restored.get("notes"), "permanent", "failed creation did not restore notes setting");
          injectFailure = true;
          injectRollbackFailure = true;
          answers.push("rollback-vault-2", "captures", "permanent");
          await vscode.commands.executeCommand("stemlink.createVault");
          assert.ok(validationErrors.some(message => message.includes("Settings rollback also failed") &&
            message.includes("Injected rollback failure")), "rollback failure was not reported");
        } finally {
          workspaceApi.getConfiguration = originalConfig;
          warningApi.showWarningMessage = previousReuseWarning;
          await originalConfig("stemlink", folder.uri).update("root", "custom-vault", vscode.ConfigurationTarget.Workspace);
        }
      } finally {
        validationApi.showErrorMessage = originalValidationError;
      }

      answers.push("A: title", "alpha, beta");
      await vscode.commands.executeCommand("stemlink.addNote");
      const created = (await vscode.workspace.fs.readDirectory(permanent)).filter(([name]) => !name.startsWith("_"));
      assert.equal(created.length, 1, "Add Note did not create a file");
      const firstText = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(permanent, created[0][0]))).toString("utf8");
      assert.match(firstText, /A: title/);
      assert.match(firstText, /alpha/);

      const createdUri = vscode.Uri.joinPath(permanent, created[0][0]);
      answers.push("A: title", "other");
      await vscode.commands.executeCommand("stemlink.addNote");
      const afterCollision = (await vscode.workspace.fs.readDirectory(permanent)).filter(([name]) => !name.startsWith("_"));
      assert.equal(afterCollision.length, 2, "second note overwrote the first");
      const secondCreated = afterCollision.find(([name]) => name !== created[0][0]);
      assert.ok(secondCreated);
      assert.equal(Buffer.from(await vscode.workspace.fs.readFile(createdUri)).toString("utf8"), firstText);
      await vscode.workspace.fs.delete(vscode.Uri.joinPath(permanent, secondCreated[0]));
      await vscode.workspace.fs.writeFile(noteTemplate, Buffer.from(`[[${created[0][0].slice(0, -3)}]]\n[[bad target]]\n`));
      const invalid = vscode.Uri.joinPath(permanent, "invalid.md");
      await vscode.workspace.fs.writeFile(invalid, Buffer.from("Invalid note\n"));
      await vscode.commands.executeCommand("stemlink.checkReferences");
      assert.ok(!vscode.languages.getDiagnostics(noteTemplate).some(diagnostic => diagnostic.source === "Stemlink"),
        "audit reported a template");
      assert.ok(vscode.languages.getDiagnostics(invalid).some(diagnostic => diagnostic.message === "Invalid note filename."),
        "audit ignored an invalid non-template filename");
      assert.ok(vscode.languages.getDiagnostics(createdUri).some(diagnostic => diagnostic.message === "No incoming references."),
        "template link counted as an audited incoming reference");
      const templateVault = new Vault(folder);
      try {
        await templateVault.ensure();
        assert.ok(templateVault.references(created[0][0].slice(0, -3)).some(ref => ref.note.name === "_template.md"),
          "template link was removed from backlinks");
      } finally {
        templateVault.dispose();
      }
      await vscode.workspace.fs.delete(invalid);

      const liveVault = new Vault(folder);
      const liveTree = new VaultTree(() => liveVault, [liveVault]);
      try {
        await Promise.all([liveVault.ensure(), liveVault.ensure()]);
        const targetStem = created[0][0].slice(0, -3);
        const liveStem = "202601021200-live-index";
        const liveUri = vscode.Uri.joinPath(permanent, `${liveStem}.md`);
        await vscode.workspace.fs.writeFile(liveUri, Buffer.from(`---\ntitle: Live\ntags: []\n---\n\n[[${targetStem}]] [[${targetStem}]]\n`));
        await waitFor(() => liveVault.references(targetStem).filter(ref => ref.note.stem === liveStem).length === 2,
          "index did not discover a new file and both references");
        assert.ok(liveVault.target(liveStem), "filename index missed a created note");
        await vscode.workspace.fs.writeFile(liveUri, Buffer.from("---\ntitle: Changed\ntags: []\n---\n\nNo links\n"));
        await waitFor(() => liveVault.get(liveStem)?.text.includes("No links") === true &&
          !liveVault.references(targetStem).some(ref => ref.note.stem === liveStem),
        "index kept stale references after a file edit");
        await vscode.workspace.fs.delete(liveUri);
        await waitFor(() => !liveVault.target(liveStem) && !liveVault.get(liveStem),
          "index kept a deleted file");

        const sections = await liveTree.getChildren();
        const captures = await liveTree.getChildren(sections[0]);
        assert.deepEqual(captures, [], "empty inbox contains captures");
        assert.equal(liveTree.getTreeItem(sections[0]), sections[0]);
        await vscode.commands.executeCommand("stemlink.refresh");
      } finally {
        liveTree.dispose();
        liveVault.dispose();
      }

      const fleetingTemplate = vscode.Uri.joinPath(permanent, "_fleeting.md");
      const fleetingText = "Custom capture prompt\n";
      await vscode.workspace.fs.writeFile(fleetingTemplate, Buffer.from(fleetingText));
      await vscode.commands.executeCommand("stemlink.addFleetingNote");
      const firstCapture = vscode.window.activeTextEditor?.document.uri;
      assert.ok(firstCapture, "fleeting note was not opened");
      assert.equal(firstCapture.with({ path: firstCapture.path.slice(0, firstCapture.path.lastIndexOf("/")) }).toString(), inbox.toString(),
        "fleeting note was not opened in the inbox");
      assert.match(firstCapture.path, /\/\d{12}-capture(?:-\d+)?\.md$/);
      assert.equal(Buffer.from(await vscode.workspace.fs.readFile(firstCapture)).toString("utf8").replace(/\r\n/g, "\n"), fleetingText);
      await vscode.commands.executeCommand("stemlink.addFleetingNote");
      const secondCapture = vscode.window.activeTextEditor?.document.uri;
      assert.ok(secondCapture && secondCapture.toString() !== firstCapture.toString(), "fleeting note overwrote an existing capture");
      assert.equal(Buffer.from(await vscode.workspace.fs.readFile(firstCapture)).toString("utf8").replace(/\r\n/g, "\n"), fleetingText);
      assert.equal(Buffer.from(await vscode.workspace.fs.readFile(secondCapture)).toString("utf8").replace(/\r\n/g, "\n"), fleetingText);
      const captureVault = new Vault(folder);
      const captureTree = new VaultTree(() => captureVault, [captureVault]);
      try {
        const sections = await captureTree.getChildren();
        const captures = await captureTree.getChildren(sections[0]);
        assert.equal(captures.length, 2, "inbox tree omitted captures");
        assert.ok(captures.every(item => item.contextValue === "stemlink.capture" && item.command?.command === "stemlink.openAt"));
      } finally {
        captureTree.dispose();
        captureVault.dispose();
      }
      await vscode.commands.executeCommand("stemlink.openAt", firstCapture, 7);
      assert.equal(vscode.window.activeTextEditor?.selection.active.character, 7, "openAt did not select the requested position");

      const errorApi = vscode.window as { showErrorMessage: typeof vscode.window.showErrorMessage };
      const originalError = errorApi.showErrorMessage;
      const errors: string[] = [];
      errorApi.showErrorMessage = new Proxy(originalError, {
        apply: (_target, _thisArg, args: unknown[]) => {
          errors.push(String(args[0]));
          return Promise.resolve(undefined);
        },
      });
      try {
        await vscode.workspace.fs.delete(fleetingTemplate);
        await vscode.commands.executeCommand("stemlink.addFleetingNote");
        assert.ok(errors.some(message => message.includes("Fleeting template not found") && message.includes("_fleeting.md")),
          "missing fleeting template was not reported");
        assert.equal((await vscode.workspace.fs.readDirectory(inbox)).length, 2, "missing template created a capture");
        await vscode.workspace.fs.createDirectory(fleetingTemplate);
        const previousErrors = errors.length;
        try {
          await vscode.commands.executeCommand("stemlink.addFleetingNote");
          assert.ok(errors.length > previousErrors, "unreadable fleeting template was not reported");
          assert.ok(!errors[errors.length - 1].includes("Fleeting template not found"),
            "non-missing template error was misreported");
          assert.equal((await vscode.workspace.fs.readDirectory(inbox)).length, 2, "unreadable template created a capture");
        } finally {
          await vscode.workspace.fs.delete(fleetingTemplate);
        }
      } finally {
        errorApi.showErrorMessage = originalError;
        await vscode.workspace.fs.writeFile(fleetingTemplate, Buffer.from(fleetingText));
      }

      const capture = vscode.Uri.joinPath(inbox, "capture.md");
      await vscode.workspace.fs.writeFile(capture, Buffer.from("Capture body\n"));
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(capture));
      answers.push("Promoted title", "ideas");
      await vscode.commands.executeCommand("stemlink.promote");
      const after = (await vscode.workspace.fs.readDirectory(permanent)).filter(([name]) => !name.startsWith("_"));
      assert.equal(after.length, 2, "promotion did not create a file");
      const promoted = after.find(([name]) => name.includes("promoted-title"));
      assert.ok(promoted);
      const promotedText = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(permanent, promoted[0]))).toString("utf8");
      assert.match(promotedText, /Capture body/);
      await assert.rejects(async () => vscode.workspace.fs.stat(capture));

      const changing = vscode.Uri.joinPath(inbox, "changing.md");
      await vscode.workspace.fs.writeFile(changing, Buffer.from("Original capture\n"));
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(changing));
      const onSave = vscode.workspace.onWillSaveTextDocument(event => {
        if (event.document.uri.path.includes("changing-capture.md")) {
          event.waitUntil(vscode.workspace.fs.writeFile(changing, Buffer.from("Changed capture\n")).then(() => []));
        }
      });
      try {
        answers.push("Changing capture", "");
        await vscode.commands.executeCommand("stemlink.promote");
      } finally {
        onSave.dispose();
      }
      assert.equal(Buffer.from(await vscode.workspace.fs.readFile(changing)).toString("utf8"), "Changed capture\n",
        "promotion removed a concurrently changed capture");

      answers.push(undefined);
      await vscode.commands.executeCommand("stemlink.addNote");
      assert.equal((await vscode.workspace.fs.readDirectory(permanent)).filter(([name]) => !name.startsWith("_")).length, 3, "cancelled note was created");
      assert.equal(answers.length, 0);

      const warningApi = vscode.window as { showWarningMessage: typeof vscode.window.showWarningMessage };
      const originalWarning = warningApi.showWarningMessage;
      const warnings: string[] = [];
      warningApi.showWarningMessage = new Proxy(originalWarning, {
        apply: (_target, _thisArg, args: unknown[]) => {
          warnings.push(String(args[0]));
          return Promise.resolve(undefined);
        },
      });
      try {
        const rename = new vscode.WorkspaceEdit();
        rename.renameFile(vscode.Uri.joinPath(permanent, created[0][0]), vscode.Uri.joinPath(permanent, "renamed.md"));
        assert.equal(await vscode.workspace.applyEdit(rename), true);
        assert.ok(warnings.some(message => message.includes("renamed")), "rename warning missing");
      } finally {
        warningApi.showWarningMessage = originalWarning;
      }

    } finally {
      windowApi.showInputBox = originalInput;
    }
  }
}
