import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import * as os from "node:os";
import * as vscode from "vscode";
import { discoverVaults, readVaultMarker, resolveVaultPaths } from "../discovery";
import {
  captureMetadata,
  isVaultInstructionFile,
  renderRouterIndexes,
  renderVaultReadme,
  routerIndexName,
  routerIndexStart,
} from "../core";
import { Vault, directChild, pathsFor, sameUri, validFolderName } from "../vault";
import { Item, VaultTree, VaultTreeSection } from "../tree";
import { VaultRouterIndexes } from "../router";
import { VaultAgentInstructions } from "../agentInstructions";

async function waitFor(condition: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function waitForFileText(
  uri: vscode.Uri,
  condition: (text: string) => boolean,
  message: string,
): Promise<void> {
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
      if (condition(text)) return;
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError && error.code === "FileNotFound")) throw error;
    }
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function testMarkdownPreview(source: vscode.Uri, target: vscode.Uri): Promise<void> {
  if (process.env.STEMLINK_DISABLE_MARKDOWN_PROVIDER === "1") return;
  const markdown = vscode.extensions.getExtension("vscode.markdown-language-features");
  assert.ok(markdown);
  await markdown.activate();
  const stem = target.path.slice(target.path.lastIndexOf("/") + 1, -3);
  const text = [
    `Reference [[${stem}]].`,
    `Missing [[202601011200-missing]] and invalid [[_${stem}]].`,
    `Inline code \`[[${stem}]]\`.`,
    `\\[[${stem}]]`,
    `[Existing [[${stem}]]](https://example.com)`,
    `After [ordinary link](https://example.com), [[${stem}]].`,
    `Emphasis **[[${stem}]]**.`,
    "",
    "```md",
    `[[${stem}]]`,
    "```",
    "",
    `    [[${stem}]]`,
  ].join("\n");
  const original = (await vscode.workspace.openTextDocument(source)).getText();
  const render = () =>
    vscode.commands.executeCommand<string>("markdown.api.render", {
      uri: source,
      version: -1,
      getText: () => text,
    });
  let html = await render();
  for (let attempt = 0; attempt < 20 && !html?.includes(`>${stem}</a>`); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    html = await render();
  }
  assert.ok(html?.includes(`href="${target.toString()}"`), "preview link target is incorrect");
  assert.equal(
    html.match(new RegExp(`>${stem}</a>`, "g"))?.length,
    3,
    `Only standalone wiki links should become anchors:\n${html}`,
  );
  assert.ok(html.includes("[[202601011200-missing]]"), "missing reference was hidden");
  assert.ok(html.includes(`[[_${stem}]]`), "invalid reference was hidden");
  assert.ok(html.includes(`<code>[[${stem}]]</code>`), "inline code was converted");
  assert.ok(html.includes(`[[${stem}]]</a>`), "existing Markdown link was changed");
  assert.ok(html.includes(`<pre`) && html.includes(`[[${stem}]]\n</code></pre>`));
  const anonymous = await vscode.commands.executeCommand<string>("markdown.api.render", text);
  assert.ok(!anonymous?.includes(`>${stem}</a>`), "preview without a source guessed a vault");
  const trust = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted");
  assert.ok(trust);
  try {
    Object.defineProperty(vscode.workspace, "isTrusted", { configurable: true, get: () => false });
    const restricted = await render();
    assert.ok(
      !restricted?.includes(`>${stem}</a>`),
      "wiki-link preview conversion ran without Workspace Trust",
    );
  } finally {
    Object.defineProperty(vscode.workspace, "isTrusted", trust);
  }
  assert.equal((await vscode.workspace.openTextDocument(source)).getText(), original);
}

async function testVirtualVault(): Promise<void> {
  const changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  const stem = "202601021200-virtual";
  let text = `---\ntitle: Virtual\ntags: []\n---\n\n[[${stem}]]\n`;
  let state: "denied" | "missing" | "ready" = "denied";
  let gate:
    { started: () => void; release: Promise<void>; missing: boolean; denied?: boolean } | undefined;
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
        if (current.denied) throw vscode.FileSystemError.NoPermissions("Old path denied");
      }
      return Buffer.from(snapshot);
    },
    createDirectory: () => {
      throw vscode.FileSystemError.NoPermissions();
    },
    writeFile: () => {
      throw vscode.FileSystemError.NoPermissions();
    },
    delete: () => {
      throw vscode.FileSystemError.NoPermissions();
    },
    rename: () => {
      throw vscode.FileSystemError.NoPermissions();
    },
  };
  const registration = vscode.workspace.registerFileSystemProvider("stemlink-test", provider, {
    isReadonly: true,
  });
  const folder: vscode.WorkspaceFolder = {
    uri: vscode.Uri.parse("stemlink-test:/workspace"),
    name: "virtual",
    index: 0,
  };
  const vault = new Vault(folder);
  const tree = new VaultTree(
    () => vault,
    () => [vault],
  );
  try {
    await tree.getChildren();
    await waitFor(
      () => tree.message("Fleeting")?.includes("Unable to load captures") === true,
      "capture count failure was not explained",
    );
    await assert.rejects(() => vault.ensure(), /Cannot read notes/);
    assert.equal(vault.indexState, "failed");
    state = "ready";
    tree.reset(vault);
    await tree.getChildren();
    await waitFor(
      () => tree.message("Fleeting") === undefined,
      "reset did not recover failed capture count",
    );
    await vault.ensure();
    assert.equal(vault.indexState, "ready");
    assert.match(tree.message("References") ?? "", /Open a permanent note/);
    assert.deepEqual(await tree.getChildren(new Item("References", "References")), []);
    state = "denied";
    await assert.rejects(() => vault.refresh(), /Cannot read notes/);
    assert.equal(vault.indexState, "failed", "failed refresh retained a success-shaped index");
    await assert.rejects(() => vault.ensure(), /Cannot read notes/);
    state = "ready";
    await vault.ensure();
    assert.equal(vault.get(stem)?.text, text, "virtual note content was not indexed");
    assert.equal(vault.references(stem).length, 1, "virtual note reference was not indexed");
    text = "---\ntitle: Changed\ntags: []\n---\n\nNo links\n";
    changes.fire([
      {
        type: vscode.FileChangeType.Changed,
        uri: vscode.Uri.joinPath(vault.paths.notes, `${stem}.md`),
      },
    ]);
    await waitFor(
      () => vault.get(stem)?.text === text && vault.references(stem).length === 0,
      "virtual file change did not update the index",
    );
    for (const missing of [false, true]) {
      let started!: () => void;
      let resume!: () => void;
      const begun = new Promise<void>((resolve) => {
        started = resolve;
      });
      const release = new Promise<void>((resolve) => {
        resume = resolve;
      });
      gate = { started, release, missing };
      const refresh = vault.refresh();
      assert.equal(vault.indexState, "indexing");
      try {
        await waitFor(() => gate === undefined, "refresh did not start reading the virtual note");
        await begun;
        text = `---\ntitle: ${missing ? "Missing race" : "Edit race"}\ntags: []\n---\n\n[[${stem}]]\n`;
        changes.fire([
          {
            type: vscode.FileChangeType.Changed,
            uri: vscode.Uri.joinPath(vault.paths.notes, `${stem}.md`),
          },
        ]);
        await waitFor(() => vault.get(stem)?.text === text, "concurrent edit was not indexed");
      } finally {
        resume();
      }
      await refresh;
      assert.equal(
        vault.get(stem)?.text,
        text,
        "refresh published stale content after a concurrent edit",
      );
      assert.equal(vault.references(stem).length, 1, "refresh lost a concurrent reference");
    }
    let started!: () => void;
    let resume!: () => void;
    const begun = new Promise<void>((resolve) => {
      started = resolve;
    });
    const release = new Promise<void>((resolve) => {
      resume = resolve;
    });
    gate = { started, release, missing: false, denied: true };
    const refresh = vault.refresh();
    const previousPaths = vault.paths;
    try {
      await waitFor(() => gate === undefined, "refresh did not start reading the old vault path");
      await begun;
      vault.selectPaths({
        ...previousPaths,
        notes: vscode.Uri.joinPath(folder.uri, "replacement"),
      });
    } finally {
      resume();
    }
    await refresh;
    assert.equal(
      vault.get(stem)?.uri.toString(),
      vscode.Uri.joinPath(vault.paths.notes, `${stem}.md`).toString(),
      "stale read failure prevented indexing the new vault paths",
    );
    vault.selectPaths(previousPaths);
    await vault.ensure();
    const uri = vscode.Uri.joinPath(vault.paths.notes, `${stem}.md`);
    gate = { started: () => {}, release: Promise.resolve(), missing: true };
    await vault.recordFile(uri);
    assert.ok(!vault.target(stem), "missing file read restored a deleted target");
    assert.ok(!vault.get(stem), "missing file read retained note content");
    assert.equal(vault.references(stem).length, 0, "missing file read retained backlinks");
    await vault.recordFile(uri);
    assert.equal(vault.get(stem)?.text, text, "recreated note was not indexed");
    {
      let start!: () => void;
      let finish!: () => void;
      const reading = new Promise<void>((resolve) => {
        start = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      gate = { started: start, release: pending, missing: true };
      const missingRead = vault.recordFile(uri);
      try {
        await reading;
        text = "---\ntitle: Recreated\ntags: []\n---\n";
        await vault.recordFile(uri);
      } finally {
        finish();
      }
      await missingRead;
      assert.equal(vault.get(stem)?.text, text, "stale missing read removed a recreated note");
      assert.ok(vault.target(stem), "stale missing read removed a recreated target");
    }
    state = "missing";
    const emptyVault = new Vault(folder);
    const emptyTree = new VaultTree(
      () => emptyVault,
      () => [emptyVault],
    );
    try {
      await emptyVault.ensure();
      assert.equal(emptyVault.all.length, 0, "missing notes folder was not treated as empty");
      const sections = await emptyTree.getChildren();
      assert.deepEqual(
        await emptyTree.getChildren(sections[1]),
        [],
        "missing inbox was not treated as empty",
      );
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
        assert.deepEqual(await emptyTree.getChildren(sections[1]), []);
        assert.ok(
          errors.some((message) => message.includes("Cannot read notes")),
          "tree hid a directory read error",
        );
        changes.fire([
          {
            type: vscode.FileChangeType.Changed,
            uri: vscode.Uri.joinPath(vault.paths.notes, `${stem}.md`),
          },
        ]);
        await waitFor(
          () => errors.some((message) => message.includes("Cannot read note file")),
          "watcher hid a file read error",
        );
      } finally {
        errorApi.showErrorMessage = originalError;
      }
    } finally {
      emptyTree.dispose();
      emptyVault.dispose();
    }
  } finally {
    tree.dispose();
    vault.dispose();
    registration.dispose();
    changes.dispose();
  }
}

async function testMockVaultFiles(extensionUri: vscode.Uri): Promise<void> {
  const root = vscode.Uri.parse("stemlink-mock:/vault");
  const inbox = vscode.Uri.joinPath(root, "capture");
  const notes = vscode.Uri.joinPath(root, "permanent");
  const templates = vscode.Uri.joinPath(root, "examples");
  const paths = { root, inbox, notes, templates };
  const generated = renderRouterIndexes("vault", "capture", "permanent", [], [], "examples");
  const files = new Map<string, string>([
    ["/vault/INDEX.md", "User-owned index\n"],
    ["/vault/capture/INDEX.md", generated.inbox],
    ["/vault/permanent/INDEX.md", generated.notes],
    ["/vault/capture/capture.md", "Capture\n"],
    ["/vault/permanent/202601011200-note.md", "Note\n"],
  ]);
  const directories = new Set(["/vault", "/vault/capture", "/vault/permanent", "/vault/examples"]);
  let deniedReadDirectory: string | undefined;
  let deniedReadFile: string | undefined;
  let deniedWriteFile: string | undefined;
  const changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  const provider: vscode.FileSystemProvider = {
    onDidChangeFile: changes.event,
    watch: () => new vscode.Disposable(() => {}),
    stat: (uri) => {
      if (directories.has(uri.path))
        return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
      const text = files.get(uri.path);
      if (text === undefined) throw vscode.FileSystemError.FileNotFound(uri);
      return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: Buffer.byteLength(text) };
    },
    readDirectory: (uri) => {
      if (uri.path === deniedReadDirectory)
        throw vscode.FileSystemError.NoPermissions("Injected directory failure");
      if (!directories.has(uri.path)) throw vscode.FileSystemError.FileNotFound(uri);
      const prefix = `${uri.path}/`;
      return [...files.keys()]
        .filter((name) => name.startsWith(prefix) && !name.slice(prefix.length).includes("/"))
        .map((name) => [name.slice(prefix.length), vscode.FileType.File]);
    },
    readFile: (uri) => {
      if (uri.path === deniedReadFile)
        throw vscode.FileSystemError.NoPermissions("Injected read failure");
      const text = files.get(uri.path);
      if (text === undefined) throw vscode.FileSystemError.FileNotFound(uri);
      return Buffer.from(text);
    },
    writeFile: (uri, content) => {
      if (uri.path === deniedWriteFile)
        throw vscode.FileSystemError.NoPermissions("Injected write failure");
      files.set(uri.path, Buffer.from(content).toString("utf8"));
    },
    createDirectory: () => {
      throw vscode.FileSystemError.NoPermissions();
    },
    delete: () => {
      throw vscode.FileSystemError.NoPermissions();
    },
    rename: () => {
      throw vscode.FileSystemError.NoPermissions();
    },
  };
  const registration = vscode.workspace.registerFileSystemProvider("stemlink-mock", provider);
  const router = new VaultRouterIndexes();
  const instructions = new VaultAgentInstructions(extensionUri);
  const windowApi = vscode.window as {
    showWarningMessage: typeof vscode.window.showWarningMessage;
  };
  const originalWarning = windowApi.showWarningMessage;
  let prompts = 0;
  let instructionAnswer: string | undefined = "Skip";
  windowApi.showWarningMessage = new Proxy(originalWarning, {
    apply: () => {
      prompts++;
      return Promise.resolve(instructionAnswer);
    },
  });
  try {
    assert.equal(await readVaultMarker(root), undefined);
    files.set("/vault/.stemlink.json", "{");
    await assert.rejects(() => readVaultMarker(root), /Invalid .*\.stemlink\.json/);
    deniedReadFile = "/vault/.stemlink.json";
    await assert.rejects(() => readVaultMarker(root), /Injected read failure/);
    deniedReadFile = undefined;

    assert.deepEqual(await router.initialize(paths), ["INDEX.md"]);
    assert.equal(files.get("/vault/INDEX.md"), "User-owned index\n");
    assert.match(files.get("/vault/capture/INDEX.md") ?? "", /Markdown captures: 1/);
    assert.match(files.get("/vault/permanent/INDEX.md") ?? "", /Markdown files: 1/);
    deniedReadDirectory = inbox.path;
    await assert.rejects(() => router.initialize(paths), /Injected directory failure/);
    deniedReadDirectory = undefined;
    files.set("/vault/capture/INDEX.md", `${routerIndexStart}\nUnclosed`);
    await assert.rejects(() => router.initialize(paths), /Malformed/);
    assert.equal(files.get("/vault/capture/INDEX.md"), `${routerIndexStart}\nUnclosed`);
    files.set("/vault/capture/INDEX.md", generated.inbox);
    deniedWriteFile = "/vault/capture/INDEX.md";
    await assert.rejects(() => router.initialize(paths), /Injected write failure/);
    assert.equal(files.get("/vault/capture/INDEX.md"), generated.inbox);
    deniedWriteFile = undefined;

    await instructions.offer(paths);
    assert.equal(prompts, 1, "missing instructions did not prompt");
    await instructions.offer(paths);
    assert.equal(prompts, 1, "Skip did not suppress the next offer in this session");
    const otherRoot = vscode.Uri.parse("stemlink-mock:/other-vault");
    const otherPaths = {
      root: otherRoot,
      inbox: vscode.Uri.joinPath(otherRoot, "capture"),
      notes: vscode.Uri.joinPath(otherRoot, "permanent"),
      templates: vscode.Uri.joinPath(otherRoot, "examples"),
    };
    for (const uri of [otherPaths.root, otherPaths.inbox, otherPaths.notes])
      directories.add(uri.path);
    await instructions.offer(otherPaths);
    assert.equal(prompts, 2, "Skip leaked into another vault");
    await new VaultAgentInstructions(extensionUri).offer(paths);
    assert.equal(prompts, 3, "Skip persisted into a new session");
    instructionAnswer = undefined;
    const dismissed = new VaultAgentInstructions(extensionUri);
    await dismissed.offer(paths);
    await dismissed.offer(paths);
    assert.equal(prompts, 5, "dismissal was treated as explicit Skip");
    assert.ok(
      ![...files.keys()].some((name) => name.endsWith("/AGENTS.md")),
      "skip created instructions",
    );
    for (const directory of [root, inbox, notes])
      files.set(`${directory.path}/AGENTS.md`, "Existing instructions\n");
    await new VaultAgentInstructions(extensionUri).offer(paths);
    assert.equal(prompts, 5, "existing instructions prompted again");
    for (const directory of [root, inbox, notes]) {
      assert.equal(files.get(`${directory.path}/AGENTS.md`), "Existing instructions\n");
    }
    const deleted = vscode.Uri.joinPath(notes, "202601021234-delete-race.md");
    const stem = "202601021234-delete-race";
    files.set(deleted.path, "References [[202601011200-note]].\n");
    const vault = new Vault({ uri: root, name: "Synthetic vault", index: 0 });
    vault.selectPaths(paths);
    const doc = await vscode.workspace.openTextDocument(deleted);
    try {
      await vscode.window.showTextDocument(doc);
      await vault.recordFile(deleted);
      assert.ok(vault.target(stem));
      files.delete(deleted.path);
      await vault.recordFile(deleted);
      assert.equal(vault.target(stem), undefined, "late read resurrected deleted open note");
      assert.equal(vault.get(stem), undefined);
      assert.equal(vault.references("202601011200-note").length, 0);
      const edit = new vscode.WorkspaceEdit();
      edit.insert(deleted, doc.positionAt(doc.getText().length), "Preserved buffer\n");
      assert.ok(await vscode.workspace.applyEdit(edit));
      await vault.recordFile(deleted);
      assert.equal(vault.target(stem), undefined, "editing orphaned buffer restored target");
      assert.ok(doc.isDirty, "deletion handling discarded editor contents");
      files.set(deleted.path, "Recreated on disk\n");
      await vault.recordFile(deleted);
      assert.ok(vault.target(stem), "legitimate recreation was not indexed");
      assert.equal(vault.get(stem)?.text, doc.getText(), "recreation lost unsaved precedence");
    } finally {
      files.set(deleted.path, "Fixture restored\n");
      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
      vault.dispose();
      files.delete(deleted.path);
    }
  } finally {
    windowApi.showWarningMessage = originalWarning;
    router.dispose();
    registration.dispose();
    changes.dispose();
  }
}

async function testRouterMappings(folder: vscode.WorkspaceFolder): Promise<void> {
  const root = vscode.Uri.joinPath(folder.uri, "router-fixture", "vault");
  const inbox = vscode.Uri.joinPath(root, "fleeting");
  const notes = vscode.Uri.joinPath(root, "notes");
  const paths = { root, inbox, notes, templates: vscode.Uri.joinPath(root, "templates") };
  const note = vscode.Uri.joinPath(notes, "202601011200-router-note.md");
  const capture = vscode.Uri.joinPath(inbox, "capture.md");
  const notesIndex = vscode.Uri.joinPath(notes, routerIndexName);
  const inboxIndex = vscode.Uri.joinPath(inbox, routerIndexName);
  const router = new VaultRouterIndexes();
  await vscode.workspace.fs.createDirectory(inbox);
  await vscode.workspace.fs.createDirectory(notes);
  await vscode.workspace.fs.writeFile(note, Buffer.from("---\ntitle: Original title\n---\nBody\n"));
  await vscode.workspace.fs.writeFile(capture, Buffer.from("Unprocessed capture\n"));
  try {
    await router.initialize(paths);
    await waitForFileText(
      notesIndex,
      (text) => text.includes("| Original title |"),
      "router omitted YAML title",
    );
    await waitForFileText(
      inboxIndex,
      (text) =>
        text.includes("| File | Title |") &&
        text.includes("[capture.md](./capture.md) | Unprocessed capture |"),
      "capture router omitted local file",
    );

    await vscode.workspace.fs.writeFile(
      note,
      Buffer.from("---\ntitle: Updated title\ndescription: Saved description\n---\nBody\n"),
    );
    router.sync([paths]);
    await waitForFileText(
      notesIndex,
      (text) => text.includes("| Saved description |"),
      "router did not refresh existing metadata on discovery",
    );
    const document = await vscode.workspace.openTextDocument(note);
    await vscode.window.showTextDocument(document);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      note,
      new vscode.Range(new vscode.Position(0, 0), document.positionAt(document.getText().length)),
      "---\ntitle: Updated title\ndescription: Unsaved description\n---\nBody\n",
    );
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    await waitForFileText(
      notesIndex,
      (text) => text.includes("| Unsaved description |"),
      "router did not reflect unsaved metadata",
    );
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await waitForFileText(
      notesIndex,
      (text) => text.includes("| Saved description |"),
      "router did not restore saved metadata after revert",
    );

    const added = vscode.Uri.joinPath(inbox, "new capture.md");
    const renamed = vscode.Uri.joinPath(inbox, "renamed capture.md");
    const creation = new vscode.WorkspaceEdit();
    creation.createFile(added, {
      contents: Buffer.from("---\ndescription: Metadata ignored\n---\nNew capture\n"),
    });
    assert.equal(await vscode.workspace.applyEdit(creation), true);
    await waitForFileText(
      inboxIndex,
      (text) => text.includes("[new capture.md](./new%20capture.md) | New capture |"),
      "router did not add new file mapping",
    );
    const rename = new vscode.WorkspaceEdit();
    rename.renameFile(added, renamed);
    assert.equal(await vscode.workspace.applyEdit(rename), true);
    await waitForFileText(
      inboxIndex,
      (text) => text.includes("[renamed capture.md]") && !text.includes("[new capture.md]"),
      "router did not update renamed mapping",
    );
    const deletion = new vscode.WorkspaceEdit();
    deletion.deleteFile(renamed);
    assert.equal(await vscode.workspace.applyEdit(deletion), true);
    await waitForFileText(
      inboxIndex,
      (text) => !text.includes("[renamed capture.md]"),
      "router kept deleted mapping",
    );
    await vscode.workspace.fs.delete(inboxIndex);
    await router.refresh(paths);
    await assert.rejects(
      async () => vscode.workspace.fs.stat(inboxIndex),
      (error: unknown) => error instanceof vscode.FileSystemError && error.code === "FileNotFound",
      "refresh recreated a deleted router",
    );
  } finally {
    router.dispose();
    if (vscode.window.activeTextEditor?.document.uri.toString() === note.toString())
      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await vscode.workspace.fs.delete(root, { recursive: true });
  }
}

const dragControllers = new Map<string, vscode.TreeDragAndDropController<Item>>();

async function testDragPromotion(inbox: vscode.Uri, notes: vscode.Uri): Promise<void> {
  const drag = dragControllers.get("stemlink.fleeting");
  const drop = dragControllers.get("stemlink.notes");
  assert.ok(drag?.handleDrag && drop?.handleDrop);
  const config = vscode.workspace.getConfiguration("stemlink", inbox);
  const previous = config.inspect<boolean>("confirmPromotion")?.workspaceFolderValue;
  const api = vscode.window as {
    showWarningMessage: typeof vscode.window.showWarningMessage;
    showErrorMessage: typeof vscode.window.showErrorMessage;
    showInformationMessage: typeof vscode.window.showInformationMessage;
    showTextDocument: typeof vscode.window.showTextDocument;
  };
  const originalWarning = api.showWarningMessage;
  const originalError = api.showErrorMessage;
  const originalInfo = api.showInformationMessage;
  const originalShow = api.showTextDocument;
  const feedback: string[] = [];
  let openings = 0;
  api.showInformationMessage = new Proxy(originalInfo, {
    apply: (_target, _receiver, args: unknown[]) => {
      feedback.push(String(args[0]));
      return Promise.resolve(undefined);
    },
  });
  api.showTextDocument = new Proxy(originalShow, {
    apply: (target, receiver, args) => {
      openings++;
      return Reflect.apply(target, receiver, args);
    },
  });
  const errors: string[] = [];
  const answers: (string | undefined)[] = [];
  let confirmations = 0;
  const sources: vscode.Uri[] = [];
  const targets: vscode.Uri[] = [];
  const cancellation = new vscode.CancellationTokenSource();
  const make = async (label: string) => {
    const uri = vscode.Uri.joinPath(inbox, `drag-${label}.md`);
    sources.push(uri);
    await vscode.workspace.fs.writeFile(
      uri,
      Buffer.from(`---\ntitle: Drag ${label}\ntags: [idea]\n---\nBody\n`),
    );
    return new Item(label, "capture", uri);
  };
  const transfer = async (items: Item[]) => {
    const data = new vscode.DataTransfer();
    await drag.handleDrag!(items, data, cancellation.token);
    return data;
  };
  const exists = async (uri: vscode.Uri) => {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return false;
      throw error;
    }
  };
  const collectTarget = () => {
    const uri = vscode.window.activeTextEditor?.document.uri;
    assert.ok(uri && directChild(uri, notes), "drop used displayed vault instead of source vault");
    targets.push(uri);
  };
  api.showWarningMessage = new Proxy(originalWarning, {
    apply: (_target, _thisArg, args: unknown[]) => {
      assert.match(String(args[0]), /Promote capture "drag-/);
      assert.equal((args[1] as vscode.MessageOptions).modal, true);
      assert.ok((args[1] as vscode.MessageOptions).detail?.includes(notes.fsPath));
      assert.equal(args[2], "Promote");
      assert.ok(answers.length, "unexpected promotion confirmation");
      confirmations++;
      return Promise.resolve(answers.shift());
    },
  });
  api.showErrorMessage = new Proxy(originalError, {
    apply: (_target, _thisArg, args: unknown[]) => {
      errors.push(String(args[0]));
      return Promise.resolve(undefined);
    },
  });
  try {
    await config.update("confirmPromotion", true, vscode.ConfigurationTarget.WorkspaceFolder);
    const first = await make("first");
    const second = await make("second");
    answers.push(undefined);
    await vscode.commands.executeCommand("stemlink.promote", first);
    assert.ok(await exists(first.uri!));
    const before = confirmations;
    const beforeOpen = openings;
    answers.push("Promote", undefined);
    for (const command of ["stemlink.editCaptureMetadata", "stemlink.discardCapture"]) {
      await vscode.commands.executeCommand(command, first, [first, second]);
      assert.match(errors[errors.length - 1], /Select one capture/);
    }
    await vscode.commands.executeCommand("stemlink.promote", first, [first, first, second]);
    collectTarget();
    assert.equal(openings - beforeOpen, 1, "batch opened more than its final created note");
    assert.ok(
      feedback.some((message) => message.includes("cancelled: 1 of 2")),
      "partial batch did not report completed and remaining work",
    );
    assert.equal(confirmations - before, 2, "duplicates were promoted or cancellation ignored");
    assert.ok(!(await exists(first.uri!)));
    assert.ok(await exists(second.uri!));
    answers.push("Promote");
    await drop.handleDrop(
      new Item("target", "note", targets[0]),
      await transfer([second]),
      cancellation.token,
    );
    collectTarget();
    assert.ok(!(await exists(second.uri!)));

    const third = await make("third");
    const data = await transfer([third]);
    cancellation.cancel();
    await drop.handleDrop(undefined, data, cancellation.token);
    assert.ok(await exists(third.uri!));

    const external = new vscode.DataTransfer();
    external.set("application/vnd.stemlink.captures", new vscode.DataTransferItem([third]));
    const active = new vscode.CancellationTokenSource();
    try {
      await drop.handleDrop(undefined, external, active.token);
      assert.ok(await exists(third.uri!), "external payload was accepted");
      await config.update("confirmPromotion", false, vscode.ConfigurationTarget.WorkspaceFolder);
      const noConfirm = new vscode.DataTransfer();
      await drag.handleDrag!([third], noConfirm, active.token);
      await drop.handleDrop(undefined, noConfirm, active.token);
      collectTarget();
      assert.ok(!(await exists(third.uri!)));
      const missing = new Item("missing", "capture", vscode.Uri.joinPath(inbox, "missing-drag.md"));
      const fourth = await make("fourth");
      const failed = new vscode.DataTransfer();
      await drag.handleDrag!([missing, fourth], failed, active.token);
      await drop.handleDrop(undefined, failed, active.token);
      assert.ok(errors.length);
      assert.ok(await exists(fourth.uri!), "batch continued after failure");
      const trust = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted");
      assert.ok(trust);
      const trustedDrag = new vscode.DataTransfer();
      await drag.handleDrag!([fourth], trustedDrag, active.token);
      try {
        Object.defineProperty(vscode.workspace, "isTrusted", {
          configurable: true,
          get: () => false,
        });
        const beforeErrors = errors.length;
        await drop.handleDrop(undefined, trustedDrag, active.token);
        assert.ok(
          errors.slice(beforeErrors).some((error) => error.includes("Trust the workspace")),
        );
        assert.ok(await exists(fourth.uri!));
      } finally {
        Object.defineProperty(vscode.workspace, "isTrusted", trust);
      }
      const another = await make("another");
      const successful = new vscode.DataTransfer();
      await drag.handleDrag!([fourth, another], successful, active.token);
      await drop.handleDrop(undefined, successful, active.token);
      collectTarget();
      assert.ok(!(await exists(fourth.uri!)));
      assert.ok(!(await exists(another.uri!)));
      const fourthTarget = (await vscode.workspace.fs.readDirectory(notes)).find(([name]) =>
        /^\d{12}-drag-fourth(?:-\d+)?\.md$/.test(name),
      );
      assert.ok(fourthTarget);
      targets.push(vscode.Uri.joinPath(notes, fourthTarget[0]));
    } finally {
      active.dispose();
    }
    assert.equal(answers.length, 0);
  } finally {
    cancellation.dispose();
    api.showWarningMessage = originalWarning;
    api.showErrorMessage = originalError;
    api.showInformationMessage = originalInfo;
    api.showTextDocument = originalShow;
    await config.update("confirmPromotion", previous, vscode.ConfigurationTarget.WorkspaceFolder);
    for (const uri of [...sources, ...targets]) {
      if (await exists(uri)) await vscode.workspace.fs.delete(uri);
    }
  }
}

async function testPermanentNoteActions(
  folder: vscode.WorkspaceFolder,
  notes: vscode.Uri,
): Promise<void> {
  const uri = vscode.Uri.joinPath(notes, "202601021234-context-note.md");
  const api = vscode.window as {
    showInputBox: typeof vscode.window.showInputBox;
    showWarningMessage: typeof vscode.window.showWarningMessage;
    showErrorMessage: typeof vscode.window.showErrorMessage;
  };
  const original = {
    input: api.showInputBox,
    warning: api.showWarningMessage,
    error: api.showErrorMessage,
  };
  const answers: (string | undefined)[] = [];
  const inputs: vscode.InputBoxOptions[] = [];
  const errors: string[] = [];
  let choice: string | undefined;
  let duringPrompt: (() => Promise<void>) | undefined;
  let duringConfirmation: (() => Promise<void>) | undefined;
  const body = "\nKeep [[202601011200-note-1]].\n";
  const initial = `---\ntitle: Old title\ntags: [idea]\ncustom: kept\n---\n${body}`;
  const read = async () =>
    Buffer.from(await vscode.workspace.fs.readFile(uri))
      .toString("utf8")
      .replace(/\r\n/g, "\n");
  const expectError = async (command: string, message: string, item: unknown = { uri }) => {
    const before = errors.length;
    await vscode.commands.executeCommand(command, item);
    assert.ok(
      errors.slice(before).some((error) => error.includes(message)),
      errors.slice(before).join("; "),
    );
  };
  api.showInputBox = async (options) => {
    assert.ok(answers.length, "unexpected metadata prompt");
    inputs.push(options ?? {});
    await duringPrompt?.();
    return answers.shift();
  };
  api.showWarningMessage = new Proxy(original.warning, {
    apply: async (_target, _thisArg, args: unknown[]) => {
      assert.ok(String(args[0]).includes("202601021234-context-note.md"));
      assert.equal((args[1] as vscode.MessageOptions).modal, true);
      assert.match((args[1] as vscode.MessageOptions).detail ?? "", /break inbound wiki links/);
      assert.equal(args[2], "Delete");
      await duringConfirmation?.();
      return choice;
    },
  });
  api.showErrorMessage = new Proxy(original.error, {
    apply: (_target, _thisArg, args: unknown[]) => {
      errors.push(String(args[0]));
      return Promise.resolve(undefined);
    },
  });
  const vault = new Vault(folder);
  try {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(initial));
    const doc = await vscode.workspace.openTextDocument(uri);
    assert.equal(new Item("note", "note", uri).contextValue, "stemlink.note");
    await vscode.window.showTextDocument(doc);
    answers.push("Changed", undefined);
    await vscode.commands.executeCommand("stemlink.editNoteMetadata", { uri });
    assert.equal(await read(), initial);
    assert.equal(inputs[0].value, "Old title");
    assert.ok(inputs[0].title?.includes(uri.fsPath), "metadata prompt omitted edited file");
    assert.equal(inputs[1].value, "idea");
    answers.push("Changed", "two");
    await vscode.commands.executeCommand("stemlink.editNoteMetadata", { uri });
    const updated = await read();
    assert.deepEqual(captureMetadata(updated), { title: "Changed", tags: ["two"] });
    assert.match(updated, /custom: kept/);
    assert.ok(updated.endsWith(body));
    assert.equal(uri.path.endsWith("202601021234-context-note.md"), true);

    const unsaved = new vscode.WorkspaceEdit();
    unsaved.insert(uri, doc.positionAt(doc.getText().length), "Unsaved body\n");
    assert.ok(await vscode.workspace.applyEdit(unsaved));
    answers.push("Dirty title", "idea");
    await vscode.commands.executeCommand("stemlink.editNoteMetadata", { uri });
    assert.ok(doc.getText().endsWith("Unsaved body\n"), "metadata edit lost unsaved content");
    assert.ok(doc.isDirty, "metadata edit saved unrelated body changes");
    assert.equal(await read(), updated, "metadata edit changed dirty note's disk content");

    answers.push("Ignored", "two");
    duringPrompt = async () => {
      duringPrompt = undefined;
      await vscode.workspace.fs.writeFile(uri, Buffer.from(updated + "Concurrent change\n"));
    };
    await expectError("stemlink.editNoteMetadata", "changed");
    assert.ok((await read()).endsWith("Concurrent change\n"));
    await vscode.workspace.fs.writeFile(uri, Buffer.from("---\ntitle: [\n---\nBody\n"));
    await vscode.commands.executeCommand("workbench.action.files.revert");
    await waitFor(
      () => doc.getText().includes("title: ["),
      "invalid metadata fixture did not load",
    );
    await expectError("stemlink.editNoteMetadata", "invalid YAML");
    for (const command of ["stemlink.editNoteMetadata", "stemlink.deleteNote"]) {
      await expectError(command, "context menu", null);
      await expectError(command, "context menu", {
        uri: vscode.Uri.joinPath(notes, "_template.md"),
      });
    }
    const trust = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted");
    assert.ok(trust);
    try {
      Object.defineProperty(vscode.workspace, "isTrusted", {
        configurable: true,
        get: () => false,
      });
      for (const command of ["stemlink.editNoteMetadata", "stemlink.deleteNote"])
        await expectError(command, "Trust the workspace");
    } finally {
      Object.defineProperty(vscode.workspace, "isTrusted", trust);
    }
    for (const cancel of [undefined, "Cancel"]) {
      choice = cancel;
      const before = await read();
      await vscode.commands.executeCommand("stemlink.deleteNote", { uri });
      assert.equal(await read(), before);
    }
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(0, 0), "Unsaved\n");
    assert.ok(await vscode.workspace.applyEdit(edit));
    choice = "Delete";
    await expectError("stemlink.deleteNote", "Save or revert");
    assert.ok(doc.isDirty);
    assert.ok(await doc.save());
    duringConfirmation = async () => {
      duringConfirmation = undefined;
      await vscode.workspace.fs.writeFile(uri, Buffer.from("Changed during confirmation\n"));
    };
    await expectError("stemlink.deleteNote", "changed");
    assert.equal(await read(), "Changed during confirmation\n");
    await vault.ensureNames();
    assert.ok(vault.target("202601021234-context-note"));
    const workspaceApi = vscode.workspace as { applyEdit: typeof vscode.workspace.applyEdit };
    const originalApplyEdit = workspaceApi.applyEdit;
    try {
      workspaceApi.applyEdit = async () => false;
      await expectError("stemlink.deleteNote", "could not be deleted");
      assert.ok((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.File);
      assert.ok(vault.target("202601021234-context-note"));
    } finally {
      workspaceApi.applyEdit = originalApplyEdit;
    }
    await vscode.commands.executeCommand("stemlink.deleteNote", { uri });
    await assert.rejects(async () => vscode.workspace.fs.stat(uri));
    await waitFor(
      () => !vault.target("202601021234-context-note"),
      "deleted note remained indexed",
    );
    assert.equal(answers.length, 0);
  } finally {
    vault.dispose();
    api.showInputBox = original.input;
    api.showWarningMessage = original.warning;
    api.showErrorMessage = original.error;
  }
}

async function testCaptureActions(
  root: vscode.Uri,
  inbox: vscode.Uri,
  notes: vscode.Uri,
): Promise<void> {
  const uri = vscode.Uri.joinPath(inbox, "context-actions.md");
  const api = vscode.window as {
    showInputBox: typeof vscode.window.showInputBox;
    showWarningMessage: typeof vscode.window.showWarningMessage;
    showErrorMessage: typeof vscode.window.showErrorMessage;
  };
  const originals = {
    input: api.showInputBox,
    warning: api.showWarningMessage,
    error: api.showErrorMessage,
  };
  const config = vscode.workspace.getConfiguration("stemlink", root);
  const previous = config.inspect<boolean>("promptForPromotionMetadata")?.workspaceFolderValue;
  const answers: (string | undefined)[] = [];
  const prompts: vscode.InputBoxOptions[] = [];
  const errors: string[] = [];
  let choice: string | undefined;
  let duringPrompt: (() => Promise<void>) | undefined;
  let duringConfirmation: (() => Promise<void>) | undefined;
  const body = "\nCapture body with [[202601011200-note-1]].\n";
  const text = `---\ncustom: kept\ntitle: Existing title\ntags: [idea]\n---\n${body}`;
  const targets: vscode.Uri[] = [];
  const read = async () =>
    Buffer.from(await vscode.workspace.fs.readFile(uri))
      .toString("utf8")
      .replace(/\r\n/g, "\n");
  const removeCapture = async () => {
    try {
      await vscode.workspace.fs.delete(uri);
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError && error.code === "FileNotFound")) throw error;
    }
  };
  const write = async (value: string) => {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(value));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand("workbench.action.files.revert");
    await waitFor(
      () => doc.getText().replace(/\r\n/g, "\n") === value,
      "capture document did not reload",
    );
    return doc;
  };
  const expectError = async (command: string, message: string, item: unknown = { uri }) => {
    const count = errors.length;
    await vscode.commands.executeCommand(command, item);
    assert.ok(
      errors.slice(count).some((error) => error.includes(message)),
      errors.slice(count).join("; "),
    );
  };
  api.showInputBox = async (options) => {
    assert.ok(answers.length, "unexpected capture metadata prompt");
    prompts.push(options ?? {});
    await duringPrompt?.();
    return answers.shift();
  };
  api.showWarningMessage = new Proxy(originals.warning, {
    apply: async (_target, _thisArg, args: unknown[]) => {
      assert.ok(String(args[0]).includes("context-actions.md"));
      assert.equal((args[1] as vscode.MessageOptions).modal, true);
      assert.equal(args[2], "Discard");
      await duringConfirmation?.();
      return choice;
    },
  });
  api.showErrorMessage = new Proxy(originals.error, {
    apply: (_target, _thisArg, args: unknown[]) => {
      errors.push(String(args[0]));
      return Promise.resolve(undefined);
    },
  });
  try {
    await config.update(
      "promptForPromotionMetadata",
      false,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await write(text);
    answers.push("Changed", undefined);
    await vscode.commands.executeCommand("stemlink.editCaptureMetadata", { uri });
    assert.equal(await read(), text, "cancelled metadata edit changed capture");
    assert.equal(prompts[0].value, "Existing title");
    assert.ok(prompts[0].title?.includes(uri.fsPath), "capture prompt omitted edited file");
    assert.equal(prompts[1].value, "idea");
    answers.push("Changed", "one, two");
    await vscode.commands.executeCommand("stemlink.editCaptureMetadata", { uri });
    assert.match(await read(), /title: Changed/);
    assert.match(await read(), /tags: \[one, two\]/);
    assert.match(await read(), /custom: kept/);
    assert.ok((await read()).endsWith(body));

    const workspaceApi = vscode.workspace as { applyEdit: typeof vscode.workspace.applyEdit };
    const originalApply = workspaceApi.applyEdit;
    try {
      workspaceApi.applyEdit = async () => false;
      const before = await read();
      answers.push("Rejected metadata", "idea");
      await expectError("stemlink.editCaptureMetadata", "Could not update");
      assert.equal(await read(), before, "failed metadata edit changed capture");
    } finally {
      workspaceApi.applyEdit = originalApply;
    }

    const dirty = await write(text);
    const unsaved = new vscode.WorkspaceEdit();
    unsaved.insert(uri, dirty.positionAt(dirty.getText().length), "Unsaved content\n");
    assert.ok(await vscode.workspace.applyEdit(unsaved));
    answers.push("Dirty metadata", "idea");
    await vscode.commands.executeCommand("stemlink.editCaptureMetadata", { uri });
    assert.ok(dirty.getText().endsWith("Unsaved content\n"), "metadata edit lost unsaved content");
    assert.ok(dirty.isDirty, "metadata edit saved unrelated capture changes");
    assert.equal(await read(), text, "metadata edit changed dirty capture's disk content");

    await write(text);
    answers.push("Ignored", "idea");
    duringPrompt = async () => {
      duringPrompt = undefined;
      await vscode.workspace.fs.writeFile(uri, Buffer.from(text + "Concurrent edit\n"));
    };
    await expectError("stemlink.editCaptureMetadata", "changed");
    assert.ok((await read()).endsWith("Concurrent edit\n"));

    for (const [source, queued, expectedPrompts] of [
      [text, [], 0],
      [text.replace("[idea]", "['idea,with-comma']"), [], 0],
      [`---\ntags: [kept]\n---\n${body}`, ["Provided title"], 1],
      [`---\ntitle: Empty tags\ntags: []\n---\n${body}`, [""], 1],
    ] as const) {
      await write(source);
      answers.push(...queued);
      const before = prompts.length;
      await vscode.commands.executeCommand("stemlink.promote", { uri });
      assert.equal(prompts.length - before, expectedPrompts);
      const target = vscode.window.activeTextEditor?.document.uri;
      assert.ok(
        target && directChild(target, notes),
        `promotion used wrong vault: ${errors.join("; ")}`,
      );
      targets.push(target);
      const promoted = Buffer.from(await vscode.workspace.fs.readFile(target))
        .toString("utf8")
        .replace(/\r\n/g, "\n");
      assert.ok(promoted.endsWith(body));
      if (source.includes("idea,with-comma"))
        assert.deepEqual(captureMetadata(promoted).tags, ["idea,with-comma"]);
      await assert.rejects(async () => vscode.workspace.fs.stat(uri));
    }

    await write(text);
    await config.update(
      "promptForPromotionMetadata",
      true,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    answers.push("Forced title", "changed");
    const beforeForce = prompts.length;
    await vscode.commands.executeCommand("stemlink.promote", { uri });
    assert.equal(prompts.length - beforeForce, 2);
    assert.equal(prompts[beforeForce].value, "Existing title");
    const forced = vscode.window.activeTextEditor?.document.uri;
    assert.ok(forced && directChild(forced, notes));
    targets.push(forced);

    const doc = await write(text);
    await vscode.window.showTextDocument(doc);
    for (const command of [
      "stemlink.promote",
      "stemlink.editCaptureMetadata",
      "stemlink.discardCapture",
    ])
      await expectError(command, "context menu", null);
    for (const cancelled of [undefined, "Cancel"]) {
      choice = cancelled;
      await vscode.commands.executeCommand("stemlink.discardCapture", { uri });
      assert.equal(await read(), text);
    }
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(0, 0), "Unsaved\n");
    assert.ok(await vscode.workspace.applyEdit(edit));
    choice = "Discard";
    await expectError("stemlink.discardCapture", "Save or revert");
    assert.ok(doc.isDirty);
    await doc.save();
    duringConfirmation = async () => {
      duringConfirmation = undefined;
      await vscode.workspace.fs.writeFile(uri, Buffer.from("Changed during confirmation\n"));
    };
    await expectError("stemlink.discardCapture", "changed");
    assert.equal(await read(), "Changed during confirmation\n");
    await write(text);
    const trust = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted");
    assert.ok(trust);
    try {
      Object.defineProperty(vscode.workspace, "isTrusted", {
        configurable: true,
        get: () => false,
      });
      for (const command of [
        "stemlink.promote",
        "stemlink.editCaptureMetadata",
        "stemlink.discardCapture",
      ])
        await expectError(command, "Trust the workspace");
    } finally {
      Object.defineProperty(vscode.workspace, "isTrusted", trust);
    }
    await vscode.commands.executeCommand("stemlink.discardCapture", { uri });
    await assert.rejects(async () => vscode.workspace.fs.stat(uri));
    assert.equal(answers.length, 0);
  } finally {
    api.showInputBox = originals.input;
    api.showWarningMessage = originals.warning;
    api.showErrorMessage = originals.error;
    await config.update(
      "promptForPromotionMetadata",
      previous,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    for (const target of targets) await vscode.workspace.fs.delete(target);
    await removeCapture();
  }
}

async function testCommandFailures(
  root: vscode.Uri,
  inbox: vscode.Uri,
  notes: vscode.Uri,
  answers: (string | undefined)[],
): Promise<void> {
  const windowApi = vscode.window as { showErrorMessage: typeof vscode.window.showErrorMessage };
  const workspaceApi = vscode.workspace as { applyEdit: typeof vscode.workspace.applyEdit };
  const fs = vscode.workspace.fs;
  const originalError = windowApi.showErrorMessage;
  const originalApplyEdit = workspaceApi.applyEdit;
  const errors: string[] = [];
  windowApi.showErrorMessage = new Proxy(originalError, {
    apply: (_target, _thisArg, args: unknown[]) => {
      errors.push(String(args[0]));
      return Promise.resolve(undefined);
    },
  });
  const readNotes = async () =>
    (await fs.readDirectory(notes))
      .filter(([name]) => !name.startsWith("_") && !isVaultInstructionFile(name))
      .map(([name]) => name)
      .sort();
  const assertError = async (command: string, message: string, ...args: unknown[]) => {
    const before = errors.length;
    await vscode.commands.executeCommand(command, ...args);
    assert.ok(
      errors.slice(before).some((error) => error.includes(message)),
      `${command} did not report ${message}: ${errors.slice(before).join("; ")}`,
    );
  };
  try {
    const initialNotes = await readNotes();
    answers.push("Cancelled note", undefined);
    await vscode.commands.executeCommand("stemlink.addNote");
    assert.deepEqual(await readNotes(), initialNotes, "cancelling tags created a note");

    workspaceApi.applyEdit = async () => false;
    try {
      answers.push("Rejected edit", "one");
      await assertError("stemlink.addNote", "Could not create the note");
      const capturesBefore = (await fs.readDirectory(inbox)).map(([name]) => name).sort();
      await assertError("stemlink.addFleetingNote", "Could not create the note");
      assert.deepEqual(
        (await fs.readDirectory(inbox)).map(([name]) => name).sort(),
        capturesBefore,
        "rejected edit created a capture",
      );
    } finally {
      workspaceApi.applyEdit = originalApplyEdit;
    }
    assert.deepEqual(await readNotes(), initialNotes, "rejected edit created a note");

    const invalidCapture = vscode.Uri.joinPath(inbox, "mock-invalid-capture.md");
    const invalidText = "---\ntitle: [\n---\nCapture body\n";
    await fs.writeFile(invalidCapture, Buffer.from(invalidText));
    try {
      await assertError("stemlink.promote", "invalid YAML", { uri: invalidCapture });
      assert.equal(Buffer.from(await fs.readFile(invalidCapture)).toString("utf8"), invalidText);
      assert.deepEqual(await readNotes(), initialNotes, "invalid capture created a note");
    } finally {
      await fs.delete(invalidCapture);
    }

    const capture = vscode.Uri.joinPath(inbox, "mock-failure-capture.md");
    const captureText = "Capture retained after rejected edit\n";
    await fs.writeFile(capture, Buffer.from(captureText));
    try {
      answers.push("Cancelled promotion", undefined);
      await vscode.commands.executeCommand("stemlink.promote", { uri: capture });
      assert.equal(Buffer.from(await fs.readFile(capture)).toString("utf8"), captureText);
      assert.deepEqual(await readNotes(), initialNotes, "cancelled promotion created a note");

      workspaceApi.applyEdit = async () => false;
      try {
        answers.push("Retained capture", "one, two");
        await assertError("stemlink.promote", "Could not create the note", { uri: capture });
      } finally {
        workspaceApi.applyEdit = originalApplyEdit;
      }
      assert.equal(
        Buffer.from(await fs.readFile(capture)).toString("utf8"),
        captureText,
        "rejected promotion lost the capture",
      );
      assert.deepEqual(await readNotes(), initialNotes, "rejected promotion created a note");
    } finally {
      await fs.delete(capture);
    }

    await assertError(
      "stemlink.selectVault",
      "selected vault is no longer available",
      vscode.Uri.joinPath(root, "nonexistent"),
    );
    await assertError("stemlink.openAt", "missing.md", vscode.Uri.joinPath(root, "missing.md"));
    assert.equal(answers.length, 0, "command left unused prompt answers");
  } finally {
    windowApi.showErrorMessage = originalError;
    workspaceApi.applyEdit = originalApplyEdit;
  }
}

async function testVaultActions(
  views: Map<string, vscode.TreeView<Item>>,
  provider: vscode.TreeDataProvider<Item>,
): Promise<void> {
  const items = (await provider.getChildren()) ?? [];
  const target = items[0];
  const selected = items[1] ?? target;
  assert.ok(target?.vault && selected?.vault);
  assert.equal(target.contextValue, "stemlink.vault");
  const vault = target.vault;
  const paths = vault.paths;
  const view = views.get("stemlink.vaults");
  assert.ok(view);
  await vscode.commands.executeCommand("stemlink.vaults.focus");
  await vscode.commands.executeCommand("stemlink.selectVault", selected.vault.paths.root);
  await waitFor(() => view.selection[0] === selected, "vault action selection was not ready");
  const api = vscode.window as {
    showInputBox: typeof vscode.window.showInputBox;
    showErrorMessage: typeof vscode.window.showErrorMessage;
    showInformationMessage: typeof vscode.window.showInformationMessage;
  };
  const original = {
    input: api.showInputBox,
    error: api.showErrorMessage,
    info: api.showInformationMessage,
  };
  const trust = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted");
  assert.ok(trust);
  const answers: (string | undefined)[] = [];
  const errors: string[] = [];
  const created: vscode.Uri[] = [];
  let duringPrompt: (() => void) | undefined;
  const probe = vscode.Uri.joinPath(paths.notes, "vault-action-probe.md");
  const otherProbe = vscode.Uri.joinPath(selected.vault.paths.notes, "vault-action-other.md");
  const summaries: string[] = [];
  const commandApi = vscode.commands as { executeCommand: typeof vscode.commands.executeCommand };
  const originalExecute = commandApi.executeCommand;
  let problemsOpened = 0;
  let rejectNavigation = false;
  commandApi.executeCommand = new Proxy(originalExecute, {
    apply: (target, receiver, args: unknown[]) => {
      if (args[0] === "workbench.actions.view.problems") {
        problemsOpened++;
        return rejectNavigation
          ? Promise.reject(new Error("Problems navigation rejected"))
          : Promise.resolve();
      }
      return Reflect.apply(target, receiver, args);
    },
  });
  const error = async (command: string, message: string, item: unknown = target) => {
    const before = errors.length;
    await vscode.commands.executeCommand(command, item);
    assert.ok(
      errors.slice(before).some((text) => text.includes(message)),
      errors.join("; "),
    );
  };
  api.showInputBox = async () => {
    assert.ok(answers.length, "unexpected vault action prompt");
    duringPrompt?.();
    return answers.shift();
  };
  api.showErrorMessage = new Proxy(original.error, {
    apply: (_target, _thisArg, args: unknown[]) => {
      errors.push(String(args[0]));
      return Promise.resolve(undefined);
    },
  });
  api.showInformationMessage = new Proxy(original.info, {
    apply: (_target, _receiver, args: unknown[]) => {
      summaries.push(String(args[0]));
      assert.equal(args[1], "Show Problems");
      return Promise.resolve("Show Problems");
    },
  });
  const untrust = () =>
    Object.defineProperty(vscode.workspace, "isTrusted", {
      configurable: true,
      get: () => false,
    });
  const stemlinkProblems = (uri: vscode.Uri) =>
    vscode.languages.getDiagnostics(uri).filter((entry) => entry.source === "Stemlink");
  const remove = async (uri: vscode.Uri) => {
    try {
      await vscode.workspace.fs.delete(uri);
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError && error.code === "FileNotFound")) throw error;
    }
  };
  const index = vscode.Uri.joinPath(paths.notes, routerIndexName);
  const createIndex = !(await vscode.workspace.fs.readDirectory(paths.notes)).some(
    ([name]) => name === routerIndexName,
  );
  try {
    if (createIndex)
      await vscode.workspace.fs.writeFile(
        index,
        Buffer.from(renderRouterIndexes("vault", "inbox", "permanent", [], []).notes),
      );
    const before = await vscode.workspace.fs.readDirectory(paths.notes);
    for (const command of ["stemlink.newPermanentNote", "stemlink.validateVault"]) {
      await error(command, "context menu", null);
      await error(command, "context menu", new Item("wrong kind", "note", probe));
      const stale = new Vault(vault.folder);
      try {
        stale.selectPaths(paths);
        await error(
          command,
          "no longer available",
          new Item("stale", "vault", undefined, undefined, stale),
        );
      } finally {
        stale.dispose();
      }
    }
    untrust();
    await error("stemlink.newPermanentNote", "Trust the workspace");
    await error("stemlink.addNote", "Trust the workspace");
    Object.defineProperty(vscode.workspace, "isTrusted", trust);
    for (const cancelled of [[undefined], ["Cancelled", undefined]]) {
      answers.push(...cancelled);
      await vscode.commands.executeCommand("stemlink.newPermanentNote", target);
    }
    answers.push("Trust changed", "idea");
    duringPrompt = untrust;
    await error("stemlink.newPermanentNote", "Trust the workspace");
    duringPrompt = undefined;
    Object.defineProperty(vscode.workspace, "isTrusted", trust);
    answers.push("Destination changed", "idea");
    duringPrompt = () =>
      vault.selectPaths({ ...paths, notes: vscode.Uri.joinPath(paths.root, "changed") });
    await error("stemlink.newPermanentNote", "notes folder changed");
    duringPrompt = undefined;
    vault.selectPaths(paths);
    assert.deepEqual(await vscode.workspace.fs.readDirectory(paths.notes), before);
    for (let i = 0; i < 2; i++) {
      answers.push("Vault context creation", "one, two");
      await vscode.commands.executeCommand("stemlink.newPermanentNote", target);
      const uri = vscode.window.activeTextEditor?.document.uri;
      assert.ok(uri && directChild(uri, paths.notes), "creation used selected vault instead");
      assert.ok(!created.some((other) => sameUri(other, uri)), "creation overwrote previous note");
      created.push(uri);
      assert.deepEqual(captureMetadata(vscode.window.activeTextEditor!.document.getText()), {
        title: "Vault context creation",
        tags: ["one", "two"],
      });
      assert.ok(
        vault.all.some((note) => sameUri(note.uri, uri)),
        "new note was not indexed",
      );
    }
    await waitForFileText(
      index,
      (text) => text.includes(created[0].path.split("/").pop()!),
      "vault action did not refresh note router",
    );
    await vscode.workspace.fs.writeFile(probe, Buffer.from("Probe\n"));
    await vscode.workspace.fs.writeFile(otherProbe, Buffer.from("Other probe\n"));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(otherProbe));
    if (selected !== target) {
      await vscode.commands.executeCommand("stemlink.checkReferences");
      assert.ok(stemlinkProblems(otherProbe).length);
    }
    const document = await vscode.workspace.openTextDocument(probe);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(probe, new vscode.Position(0, 0), "[[202601011200-missing-vault-action-target]]\n");
    assert.ok(await vscode.workspace.applyEdit(edit));
    untrust();
    await vscode.commands.executeCommand("stemlink.validateVault", target);
    Object.defineProperty(vscode.workspace, "isTrusted", trust);
    assert.ok(
      stemlinkProblems(probe).some((entry) =>
        entry.message.includes("missing-vault-action-target"),
      ),
    );
    assert.equal(
      Buffer.from(await vscode.workspace.fs.readFile(probe)).toString("utf8"),
      "Probe\n",
    );
    assert.ok(document.isDirty, "validation saved an unsaved document");
    if (selected !== target) assert.equal(stemlinkProblems(otherProbe).length, 0);
    assert.ok(
      summaries.some(
        (message) => message.includes(paths.root.fsPath) && message.includes("permanent notes"),
      ),
      "validation summary omitted vault or scope",
    );
    await waitFor(() => problemsOpened > 0, "Show Problems did not navigate");
    rejectNavigation = true;
    await vscode.commands.executeCommand("stemlink.validateVault", target);
    await waitFor(
      () => errors.some((message) => message.includes("Problems navigation rejected")),
      "Problems navigation failure was not reported",
    );
    rejectNavigation = false;
    const previousProblems = stemlinkProblems(probe);
    const originalRefresh = vault.refresh;
    vault.refresh = async () => {
      throw new Error("validation refresh rejected");
    };
    try {
      await error("stemlink.validateVault", "validation refresh rejected");
      assert.deepEqual(
        stemlinkProblems(probe),
        previousProblems,
        "failed validation erased results",
      );
    } finally {
      vault.refresh = originalRefresh;
    }
    assert.equal(view.selection[0], selected, "vault actions changed selection");
    assert.equal(answers.length, 0);
  } finally {
    duringPrompt = undefined;
    commandApi.executeCommand = originalExecute;
    Object.defineProperty(vscode.workspace, "isTrusted", trust);
    vault.selectPaths(paths);
    api.showInputBox = original.input;
    api.showErrorMessage = original.error;
    api.showInformationMessage = original.info;
    for (const uri of [...created, probe, otherProbe]) {
      const document = vscode.workspace.textDocuments.find((entry) => sameUri(entry.uri, uri));
      if (document) {
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
      }
      await remove(uri);
    }
    if (createIndex) await remove(index);
    await Promise.all([...new Set([vault, selected.vault])].map((item) => item.refresh()));
  }
}

async function testNoteTagFiltering(
  views: Map<string, vscode.TreeView<Item>>,
  vaultProvider: vscode.TreeDataProvider<Item>,
  notesProvider: vscode.TreeDataProvider<Item>,
): Promise<void> {
  const vaultItems = (await vaultProvider.getChildren()) ?? [];
  const item = vaultItems[0];
  assert.ok(item?.vault);
  const vault = item.vault;
  const previous = views.get("stemlink.vaults")?.selection[0];
  const view = views.get("stemlink.notes");
  assert.ok(view);
  const paths = vault.paths;
  const alpha = "tagfilter-alpha";
  const beta = "tagfilter-beta";
  const gamma = "tagfilter-gamma";
  const first = vscode.Uri.joinPath(paths.notes, "202601021200-tag-filter-first.md");
  const second = vscode.Uri.joinPath(paths.notes, "202601021201-tag-filter-second.md");
  const invalid = vscode.Uri.joinPath(paths.notes, "202601021202-tag-filter-invalid.md");
  const excluded = vscode.Uri.joinPath(paths.notes, "_tag-filter.md");
  const capture = vscode.Uri.joinPath(paths.inbox, "tag-filter.md");
  const nestedFolder = vscode.Uri.joinPath(paths.notes, "tag-filter-nested");
  const nested = vscode.Uri.joinPath(nestedFolder, "202601021203-tag-filter-nested.md");
  const added = vscode.Uri.joinPath(paths.notes, "202601021204-tag-filter-added.md");
  const problemFixtures: vscode.Uri[] = [];
  const tagProblems = (uri: vscode.Uri) =>
    vscode.languages.getDiagnostics(uri).filter((entry) => entry.source === "Stemlink tags");
  const otherVault = vaultItems[1]?.vault;
  const otherNote = otherVault
    ? vscode.Uri.joinPath(otherVault.paths.notes, "202601021205-tag-filter-other.md")
    : undefined;
  const api = vscode.window as {
    createQuickPick: typeof vscode.window.createQuickPick;
    showWarningMessage: typeof vscode.window.showWarningMessage;
  };
  const original = { picker: api.createQuickPick, warning: api.showWarningMessage };
  type TagItem = vscode.QuickPickItem & { tag: string };
  const pickers: vscode.QuickPick<TagItem>[] = [];
  const warnings: string[] = [];
  const trust = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted");
  assert.ok(trust);
  const rows = async () => (await notesProvider.getChildren()) ?? [];
  const open = async () => {
    await vscode.commands.executeCommand("stemlink.filterByTags");
    const picker = pickers.at(-1);
    assert.ok(picker && !picker.busy && picker.enabled);
    return picker;
  };
  const accept = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await vscode.commands.executeCommand("workbench.action.acceptSelectedQuickOpenItem");
  };
  const search = async (picker: vscode.QuickPick<TagItem>, tag: string) => {
    picker.value = tag;
    // QuickInput batches property updates before sending them to the workbench.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await vscode.commands.executeCommand("quickInput.first");
    await waitFor(
      () => picker.activeItems[0]?.tag === tag,
      `native search did not activate ${tag}`,
    );
  };
  const choose = async (picker: vscode.QuickPick<TagItem>, tag: string) => {
    await search(picker, tag);
    await vscode.commands.executeCommand("workbench.action.quickPickManyToggle");
    await waitFor(
      () => picker.selectedItems.some((entry) => entry.tag === tag),
      `native checkbox did not select ${tag}`,
    );
  };
  api.createQuickPick = new Proxy(original.picker, {
    apply: (target, thisArg, args: unknown[]) => {
      const picker = Reflect.apply(target, thisArg, args) as vscode.QuickPick<TagItem>;
      pickers.push(picker);
      return picker;
    },
  });
  api.showWarningMessage = new Proxy(original.warning, {
    apply: (_target, _thisArg, args: unknown[]) => {
      warnings.push(String(args[0]));
      return Promise.resolve(undefined);
    },
  });
  try {
    await vscode.workspace.fs.writeFile(
      first,
      Buffer.from(`---\ntitle: First\ntags: [' TagFilter-ALPHA ', ${alpha}, ${beta}]\n---\nBody\n`),
    );
    await vscode.workspace.fs.writeFile(
      second,
      Buffer.from(`---\ntitle: [invalid, title]\ntags: [${beta}, ${gamma}]\n---\nBody\n`),
    );
    await vscode.workspace.fs.writeFile(invalid, Buffer.from("---\ntags: [valid, 42]\n---\n"));
    await vscode.workspace.fs.writeFile(
      excluded,
      Buffer.from("---\ntags: [tagfilter-excluded]\n---\n"),
    );
    await vscode.workspace.fs.writeFile(
      capture,
      Buffer.from("---\ntags: [tagfilter-capture]\n---\n"),
    );
    await vscode.workspace.fs.createDirectory(nestedFolder);
    await vscode.workspace.fs.writeFile(
      nested,
      Buffer.from("---\ntags: [tagfilter-nested]\n---\n"),
    );
    if (otherNote)
      await vscode.workspace.fs.writeFile(
        otherNote,
        Buffer.from("---\ntags: [tagfilter-other]\n---\n"),
      );
    await vscode.commands.executeCommand("stemlink.selectVault", paths.root);
    await vault.refresh();
    const snapshot = vault.get("202601021200-tag-filter-first");
    assert.ok(snapshot);
    const text = Object.getOwnPropertyDescriptor(snapshot, "text");
    assert.ok(text);
    let reads = 0;
    const cacheTree = new VaultTree(
      () => vault,
      () => [vault],
    );
    Object.defineProperty(snapshot, "text", {
      configurable: true,
      get: () => {
        reads++;
        return text.value;
      },
    });
    try {
      await cacheTree.getChildren(new Item("Notes", "Notes"));
      assert.equal(reads, 0, "unfiltered Notes read content");
      await cacheTree.tagChoices(vault);
      assert.equal(reads, 1);
      vault.changed.fire();
      await cacheTree.tagChoices(vault);
      assert.equal(reads, 1, "unchanged note metadata was reparsed");
    } finally {
      Object.defineProperty(snapshot, "text", text);
      cacheTree.dispose();
    }
    const allRows = await rows();
    assert.ok(allRows.some((row) => row.uri && sameUri(row.uri, invalid)));
    const picker = await open();
    assert.ok(picker.canSelectMany);
    assert.equal(picker.matchOnDescription, false);
    const choices = picker.items.filter((entry) => entry.tag.startsWith("tagfilter-"));
    assert.deepEqual(
      choices.map((entry) => [entry.tag, entry.description]),
      [
        [alpha, "1 note"],
        [beta, "2 notes"],
        [gamma, "1 note"],
      ],
    );
    assert.ok(warnings.some((warning) => warning.includes("1 note has invalid tag metadata")));
    assert.equal(tagProblems(invalid).length, 1, "tag error omitted file-level diagnostic");
    const warningCount = warnings.length;
    await choose(picker, alpha);
    await choose(picker, beta);
    await search(picker, gamma);
    assert.deepEqual(picker.selectedItems.map((entry) => entry.tag).sort(), [alpha, beta]);
    assert.equal(view.description, undefined, "pending selection changed active filter");
    await accept();
    await waitFor(() => view.description === `Tags: ${alpha}, ${beta}`, "filter did not apply");
    assert.deepEqual(
      (await rows()).map((row) => row.uri?.toString()),
      [first.toString(), second.toString()],
    );
    await waitFor(() => view.title?.endsWith("(2)") === true, "filtered count did not update");
    const note = (await rows())[0];
    assert.equal(note.command?.command, "stemlink.openAt");
    await vscode.commands.executeCommand("stemlink.openAt", ...(note.command?.arguments ?? []));
    assert.ok(
      vscode.window.activeTextEditor && sameUri(vscode.window.activeTextEditor.document.uri, first),
    );
    const cancel = await open();
    assert.deepEqual(cancel.selectedItems.map((entry) => entry.tag).sort(), [alpha, beta]);
    cancel.selectedItems = cancel.items.filter((entry) => entry.tag === gamma);
    await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
    assert.equal(view.description, `Tags: ${alpha}, ${beta}`, "Escape changed filter");
    const onlyAlpha = await open();
    onlyAlpha.selectedItems = onlyAlpha.items.filter((entry) => entry.tag === alpha);
    await accept();
    await waitFor(() => view.description === `Tags: ${alpha}`, "single filter did not apply");
    const document = await vscode.workspace.openTextDocument(first);
    const edit = new vscode.WorkspaceEdit();
    const start = document.positionAt(0);
    edit.replace(
      first,
      new vscode.Range(start, document.positionAt(document.getText().length)),
      `---\ntags: [${gamma}]\n---\nUnsaved\n`,
    );
    assert.ok(await vscode.workspace.applyEdit(edit));
    assert.equal((await rows()).length, 0, "unsaved metadata did not update matching rows");
    await waitFor(() => view.title?.endsWith("(0)") === true, "zero matching count did not update");
    const missing = await open();
    assert.equal(missing.items.find((entry) => entry.tag === alpha)?.description, "0 notes");
    assert.equal(missing.items.find((entry) => entry.tag === gamma)?.description, "2 notes");
    assert.deepEqual(
      missing.selectedItems.map((entry) => entry.tag),
      [alpha],
    );
    missing.hide();
    assert.equal(warnings.length, warningCount, "unchanged invalid metadata notified repeatedly");
    if (otherVault) {
      const stale = await open();
      stale.selectedItems = stale.items.filter((entry) => entry.tag === gamma);
      await vscode.commands.executeCommand("stemlink.selectVault", otherVault.paths.root);
      assert.equal(view.description, undefined, "filter leaked to another vault");
      const otherPicker = await open();
      assert.deepEqual(otherPicker.selectedItems, []);
      assert.deepEqual(
        otherPicker.items
          .filter((entry) => entry.tag.startsWith("tagfilter-"))
          .map((entry) => entry.tag),
        ["tagfilter-other"],
      );
      otherPicker.selectedItems = otherPicker.items.filter(
        (entry) => entry.tag === "tagfilter-other",
      );
      await accept();
      await waitFor(
        () => view.description === "Tags: tagfilter-other",
        "second vault filter did not apply",
      );
      await vscode.commands.executeCommand("stemlink.selectVault", paths.root);
      assert.equal(view.description, `Tags: ${alpha}`, "switching lost vault filter");
      await vscode.commands.executeCommand("stemlink.selectVault", otherVault.paths.root);
      assert.equal(view.description, "Tags: tagfilter-other", "second vault selection was lost");
      await vscode.commands.executeCommand("stemlink.clearTagFilter");
      await vscode.commands.executeCommand("stemlink.selectVault", paths.root);
    }
    Object.defineProperty(vscode.workspace, "isTrusted", { configurable: true, get: () => false });
    const untrusted = await open();
    untrusted.selectedItems = [];
    await accept();
    await waitFor(() => view.description === undefined, "empty selection did not clear filter");
    assert.deepEqual(
      (await rows()).map((row) => row.uri?.toString()),
      allRows.map((row) => row.uri?.toString()),
    );
    assert.ok(document.isDirty, "filtering saved unsaved content");
    assert.ok(
      Buffer.from(await vscode.workspace.fs.readFile(first))
        .toString("utf8")
        .includes("TagFilter-ALPHA"),
    );
    const again = await open();
    again.selectedItems = again.items.filter((entry) => entry.tag === gamma);
    await accept();
    await waitFor(() => view.description === `Tags: ${gamma}`, "gamma filter did not apply");
    Object.defineProperty(vscode.workspace, "isTrusted", trust);
    await vscode.workspace.fs.writeFile(added, Buffer.from(`---\ntags: [${gamma}]\n---\n`));
    await waitFor(
      () => Boolean(vault.get("202601021204-tag-filter-added")),
      "new note was not indexed",
    );
    assert.equal((await rows()).length, 3, "new note did not enter active filter");
    await vscode.workspace.fs.delete(added);
    await waitFor(() => !vault.get("202601021204-tag-filter-added"), "deleted note stayed indexed");
    assert.equal((await rows()).length, 2, "deleted note stayed in active filter");
    await vscode.commands.executeCommand("stemlink.clearTagFilter");
    assert.equal(view.description, undefined);
    await vscode.commands.executeCommand("stemlink.checkReferences");
    assert.equal(tagProblems(invalid).length, 1, "manual validation cleared tag diagnostics");
    await vscode.workspace.fs.writeFile(invalid, Buffer.from("---\ntags: []\n---\n"));
    await waitFor(() => tagProblems(invalid).length === 0, "fixed metadata retained diagnostics");
    for (let i = 0; i < 8; i++) {
      const uri = vscode.Uri.joinPath(
        paths.notes,
        `202601021209-tag-error-${i}-${"long".repeat(12)}.md`,
      );
      problemFixtures.push(uri);
      await vscode.workspace.fs.writeFile(uri, Buffer.from("---\ntags: 1\n---\n"));
    }
    await waitFor(
      () => problemFixtures.every((uri) => tagProblems(uri).length === 1),
      "tag diagnostics did not cover all invalid notes",
    );
    assert.ok(
      warnings
        .filter((message) => message.includes("invalid tag metadata"))
        .every((message) => message.length <= paths.root.fsPath.length + 100),
      "tag notification grew with per-file details",
    );
  } finally {
    Object.defineProperty(vscode.workspace, "isTrusted", trust);
    pickers.forEach((picker) => picker.hide());
    await vscode.commands.executeCommand("stemlink.clearTagFilter");
    api.createQuickPick = original.picker;
    api.showWarningMessage = original.warning;
    for (const uri of [first, second, invalid, excluded, capture, nested, ...problemFixtures])
      await vscode.workspace.fs.delete(uri);
    await waitFor(
      () => [invalid, ...problemFixtures].every((uri) => tagProblems(uri).length === 0),
      "deleted notes retained tag diagnostics",
    );
    if (otherNote) await vscode.workspace.fs.delete(otherNote);
    await vscode.workspace.fs.delete(nestedFolder);
    if (previous?.vault)
      await vscode.commands.executeCommand("stemlink.selectVault", previous.vault.paths.root);
  }
}

async function testMultiRoot(
  views: Map<string, vscode.TreeView<Item>>,
  provider: vscode.TreeDataProvider<Item>,
  notesProvider: vscode.TreeDataProvider<Item>,
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  assert.equal(folders?.length, 2, "multi-root fixture missing");
  assert.ok(folders);
  const api = vscode.window as {
    showInputBox: typeof vscode.window.showInputBox;
    showWorkspaceFolderPick: typeof vscode.window.showWorkspaceFolderPick;
    showOpenDialog: typeof vscode.window.showOpenDialog;
    showWarningMessage: typeof vscode.window.showWarningMessage;
  };
  const originalInput = api.showInputBox;
  const originalPicker = api.showWorkspaceFolderPick;
  const originalOpen = api.showOpenDialog;
  const originalWarning = api.showWarningMessage;
  const answers = ["second-vault", "captures", "permanent"];
  let skippedInstructionPrompts = 0;
  try {
    api.showInputBox = async () => {
      assert.ok(answers.length, "unexpected input prompt");
      return answers.shift();
    };
    api.showWorkspaceFolderPick = async () => undefined;
    await vscode.commands.executeCommand("stemlink.createVault");
    assert.equal(answers.length, 3, "cancelled workspace picker prompted for folders");
    api.showWorkspaceFolderPick = async () => folders[1];
    api.showWarningMessage = new Proxy(originalWarning, {
      apply: (_target, _thisArg, args: unknown[]) => {
        if (String(args[0]).includes("AGENTS.md")) {
          skippedInstructionPrompts++;
          return Promise.resolve("Skip");
        }
        return Promise.resolve(undefined);
      },
    });
    await vscode.commands.executeCommand("stemlink.createVault");
    assert.equal(answers.length, 0);
    await waitFor(
      () => views.get("stemlink.vaults")?.badge?.value === 2,
      "badge did not count both workspace vaults",
    );
    const notes = vscode.Uri.joinPath(folders[1].uri, "second-vault", "permanent");
    const secondRootInstructions = vscode.Uri.joinPath(folders[1].uri, "second-vault", "AGENTS.md");
    assert.ok((await vscode.workspace.fs.stat(notes)).type & vscode.FileType.Directory);
    await assert.rejects(
      async () => vscode.workspace.fs.stat(secondRootInstructions),
      (error: unknown) => error instanceof vscode.FileSystemError && error.code === "FileNotFound",
      "declining agent instructions created a file",
    );
    assert.equal(skippedInstructionPrompts, 1, "Create did not offer optional agent instructions");
    assert.equal(
      vscode.workspace.getConfiguration("stemlink", folders[1].uri).get("root"),
      "second-vault",
    );
    assert.equal(
      vscode.workspace.getConfiguration("stemlink", folders[0].uri).get("root"),
      "notes",
      "creating a second vault changed the first workspace's settings",
    );
    await testVaultActions(views, provider);
    await testNoteTagFiltering(views, provider, notesProvider);
    const firstCapture = vscode.Uri.joinPath(folders[0].uri, "notes", "inbox", "item-vault.md");
    const firstConfig = vscode.workspace.getConfiguration("stemlink", folders[0].uri);
    const oldPrompt = firstConfig.inspect<boolean>(
      "promptForPromotionMetadata",
    )?.workspaceFolderValue;
    await firstConfig.update(
      "promptForPromotionMetadata",
      false,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    {
      const config = vscode.workspace.getConfiguration("stemlink", folders[1].uri);
      const old = config.inspect<boolean>("promptForPromotionMetadata")?.workspaceFolderValue;
      try {
        await config.update(
          "promptForPromotionMetadata",
          true,
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
        await vscode.workspace.fs.writeFile(
          firstCapture,
          Buffer.from("---\ntitle: Item vault target\ntags: [idea]\n---\nBody\n"),
        );
        await vscode.commands.executeCommand("stemlink.promote", { uri: firstCapture });
        const target = vscode.window.activeTextEditor?.document.uri;
        assert.ok(
          target && directChild(target, vscode.Uri.joinPath(folders[0].uri, "notes", "permanent")),
          "promotion did not use right-clicked capture's vault and setting",
        );
        await vscode.workspace.fs.delete(target);
      } finally {
        await config.update(
          "promptForPromotionMetadata",
          old,
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
        await firstConfig.update(
          "promptForPromotionMetadata",
          oldPrompt,
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
      }
    }
    const firstSource = vscode.Uri.joinPath(
      folders[0].uri,
      "notes",
      "permanent",
      "202601011200-note-0.md",
    );
    const firstTarget = vscode.Uri.joinPath(
      folders[0].uri,
      "notes",
      "permanent",
      "202601011200-note-1.md",
    );
    const secondTarget = vscode.Uri.joinPath(notes, "202601011200-note-1.md");
    await vscode.workspace.fs.writeFile(
      secondTarget,
      Buffer.from("---\ntitle: Second vault target\ntags: []\n---\n\nSecond vault.\n"),
    );
    await testMarkdownPreview(firstSource, firstTarget);
    await testMarkdownPreview(secondTarget, secondTarget);
    await testPermanentNoteActions(
      folders[0],
      vscode.Uri.joinPath(folders[0].uri, "notes", "permanent"),
    );
    await testDragPromotion(
      vscode.Uri.joinPath(folders[0].uri, "notes", "inbox"),
      vscode.Uri.joinPath(folders[0].uri, "notes", "permanent"),
    );
    const secondConfig = vscode.workspace.getConfiguration("stemlink", folders[1].uri);
    const previousCounts = secondConfig.inspect<boolean>("showCounts")?.workspaceFolderValue;
    try {
      await secondConfig.update("showCounts", false, vscode.ConfigurationTarget.WorkspaceFolder);
      await waitFor(
        () => views.get("stemlink.vaults")?.title === "Vaults",
        "second vault did not use its folder-scoped count setting",
      );
      assert.equal(
        views.get("stemlink.vaults")?.badge?.value,
        2,
        "hiding counts also hid the vault badge",
      );
      await vscode.commands.executeCommand(
        "stemlink.selectVault",
        vscode.Uri.joinPath(folders[0].uri, "notes"),
      );
      await waitFor(
        () => views.get("stemlink.vaults")?.title?.startsWith("Vaults (") === true,
        "first vault did not retain its count setting",
      );
      await vscode.commands.executeCommand(
        "stemlink.selectVault",
        vscode.Uri.joinPath(folders[1].uri, "second-vault"),
      );
      await waitFor(
        () => views.get("stemlink.vaults")?.title === "Vaults",
        "switching back did not restore the second vault's count setting",
      );
    } finally {
      await secondConfig.update(
        "showCounts",
        previousCounts,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
    }
    const secondInboxIndex = vscode.Uri.joinPath(
      folders[1].uri,
      "second-vault",
      "captures",
      routerIndexName,
    );
    assert.match(
      Buffer.from(await vscode.workspace.fs.readFile(secondInboxIndex)).toString("utf8"),
      /Markdown captures: 0/,
    );
    const external = vscode.Uri.joinPath(folders[1].uri, "..", "external-vault");
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(external, "inbox"));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(external, "notes"));
    const externalMarker = Buffer.from(
      JSON.stringify({ version: 1, inbox: "inbox", notes: "notes" }),
    );
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(external, ".stemlink.json"),
      externalMarker,
    );
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(external, "notes", "_fleeting.md"),
      Buffer.from("External capture.\n"),
    );
    api.showOpenDialog = async () => [external];
    await vscode.commands.executeCommand("stemlink.openVault");
    await waitFor(
      () => skippedInstructionPrompts === 2,
      "Open vault did not finish its optional instructions prompt",
    );
    await assert.rejects(
      async () => vscode.workspace.fs.stat(vscode.Uri.joinPath(external, "AGENTS.md")),
      (error: unknown) => error instanceof vscode.FileSystemError && error.code === "FileNotFound",
      "declining agent instructions created a file in the opened vault",
    );
    assert.equal(
      skippedInstructionPrompts,
      2,
      "Open vault did not offer optional agent instructions",
    );
    assert.ok(
      vscode.workspace.workspaceFolders?.some((candidate) => sameUri(candidate.uri, external)),
      "external vault was not added to the workspace",
    );
    await waitFor(
      () => views.get("stemlink.vaults")?.badge?.value === 3,
      "badge did not include the opened vault",
    );
    await vscode.commands.executeCommand("stemlink.addFleetingNote");
    const externalInboxIndex = vscode.Uri.joinPath(external, "inbox", routerIndexName);
    await waitForFileText(
      externalInboxIndex,
      (text) => text.includes("Markdown captures: 1"),
      "external vault router did not update after its capture was added",
    );
    assert.match(
      Buffer.from(await vscode.workspace.fs.readFile(secondInboxIndex)).toString("utf8"),
      /Markdown captures: 0/,
      "capture in one vault changed another vault's router",
    );
    assert.equal(
      (await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(external, "inbox"))).filter(
        ([name]) => !isVaultInstructionFile(name),
      ).length,
      1,
      "external vault was not selected after adding it",
    );
    await vscode.commands.executeCommand("stemlink.openVault");
    assert.equal(vscode.workspace.workspaceFolders?.length, 3, "external folder was added twice");
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
        assert.equal(
          remove
            ? vscode.workspace.updateWorkspaceFolders(3, 1)
            : vscode.workspace.updateWorkspaceFolders(3, 0, { uri: third }),
          true,
        );
        await changed;
      } finally {
        subscription?.dispose();
        if (timer) clearTimeout(timer);
      }
    };
    await changeFolders(false);
    await changeFolders(true);
    assert.equal(
      vscode.workspace.getConfiguration("stemlink", folders[1].uri).get("root"),
      "second-vault",
    );
  } finally {
    api.showInputBox = originalInput;
    api.showWorkspaceFolderPick = originalPicker;
    api.showOpenDialog = originalOpen;
    api.showWarningMessage = originalWarning;
  }
}

async function testDiscovery(folder: vscode.WorkspaceFolder): Promise<void> {
  const root = vscode.Uri.joinPath(folder.uri, "existing-vault");
  const otherRoot = vscode.Uri.joinPath(folder.uri, "other-vault");
  const notes = vscode.Uri.joinPath(root, "stable");
  const first = vscode.Uri.joinPath(notes, "202601011200-note-0.md");
  const second = vscode.Uri.joinPath(notes, "202601011200-note-1.md");
  const document = await vscode.workspace.openTextDocument(first);
  await vscode.window.showTextDocument(document);
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
    await vscode.commands.executeCommand("stemlink.addFleetingNote");
    assert.equal(errors.length, 0, "first vault was not automatically selected");
  } finally {
    errorApi.showErrorMessage = originalError;
  }
  const discovered = await discoverVaults(folder);
  const foundRoot = discovered.find((candidate) => candidate.root.toString() === root.toString());
  assert.ok(foundRoot, "fixture marker was not discovered");
  assert.ok(
    document.uri.toString().startsWith(`${foundRoot.root.toString()}/`),
    `document ${document.uri} is outside discovered root ${foundRoot.root}`,
  );
  const probe = new Vault(folder);
  try {
    probe.selectPaths(foundRoot);
    await probe.ensureNames();
    assert.ok(probe.target("202601011200-note-1"), "discovered vault names were not indexed");
  } finally {
    probe.dispose();
  }
  let links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
    "vscode.executeLinkProvider",
    first,
  );
  assert.ok(
    links?.some((link) => link.target?.toString() === second.toString()),
    `discovered vault links do not resolve: ${JSON.stringify(links?.map((link) => link.target?.toString()))}`,
  );
  await vscode.commands.executeCommand("stemlink.selectVault", root);
  const captures = await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(root, "fleeting"));
  assert.equal(
    captures.filter(([name]) => name.endsWith(".md")).length,
    1,
    "discovered inbox was not used",
  );
  await vscode.commands.executeCommand("stemlink.selectVault", otherRoot);
  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand("stemlink.addFleetingNote");
  const otherCaptures = await vscode.workspace.fs.readDirectory(
    vscode.Uri.joinPath(otherRoot, "inbox"),
  );
  assert.equal(
    otherCaptures.filter(([name]) => name.endsWith(".md")).length,
    1,
    "active editor changed the manually selected vault",
  );
  assert.equal(
    (await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(root, "fleeting"))).length,
    1,
    "capture was written to the wrong vault",
  );
  links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
    "vscode.executeLinkProvider",
    first,
  );
  assert.ok(
    links?.some((link) => link.target?.toString() === second.toString()),
    "link navigation used the selected vault instead of the note's vault",
  );
  await vscode.commands.executeCommand("stemlink.selectVault", root);

  const firstPaths = await readVaultMarker(root);
  const otherPaths = await readVaultMarker(otherRoot);
  assert.ok(firstPaths && otherPaths);
  const firstVault = new Vault(folder);
  const otherVault = new Vault(folder);
  firstVault.selectPaths(firstPaths);
  otherVault.selectPaths(otherPaths);
  let active: Vault | undefined = firstVault;
  const tree = new VaultTree(
    () => active,
    () => [firstVault, otherVault],
  );
  try {
    await vscode.window.showTextDocument(document);
    let sections = await tree.getChildren();
    assert.equal(sections[0].label, "Vaults (2)", "vault selection waited for counts");
    const countsDeadline = Date.now() + 5000;
    while (sections[1].label !== "fleeting (1)" || sections[2].label !== "stable (3)") {
      if (Date.now() >= countsDeadline) throw new Error("vault counts did not become ready");
      await new Promise((resolve) => setTimeout(resolve, 25));
      sections = await tree.getChildren();
    }
    assert.deepEqual(
      sections.map((item) => item.label),
      ["Vaults (2)", "fleeting (1)", "stable (3)", "References (...)"],
    );
    const vaultItems = await tree.getChildren(sections[0]);
    assert.deepEqual(
      vaultItems.map((item) => item.label),
      ["existing-vault", "other-vault"],
    );
    for (const item of vaultItems) {
      assert.ok(
        item.iconPath instanceof vscode.ThemeIcon && item.iconPath.id === "archive",
        "vault row lacks the native archive icon",
      );
      assert.notEqual(item.description, "Selected", "vault row still has Selected text");
    }
    assert.equal(vaultItems[1].command?.command, "stemlink.selectVault");
    assert.equal(vaultItems[1].command?.title, "Select vault");
    await firstVault.ensure();
    sections = await tree.getChildren();
    assert.equal(sections[3].label, "References (2)");
    let references = await tree.getChildren(sections[3]);
    assert.deepEqual(
      references.map((item) => item.label),
      ["Inbound (1)", "Outbound (1)"],
    );
    assert.ok(
      references.every(
        (item) => item.collapsibleState === vscode.TreeItemCollapsibleState.Expanded,
      ),
      "reference groups should default to expanded",
    );

    const edit = new vscode.WorkspaceEdit();
    edit.insert(
      first,
      document.positionAt(document.getText().length),
      "\n[[202601011200-note-1]] [[202601011200-note-1]]",
    );
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    sections = await tree.getChildren();
    references = await tree.getChildren(sections[3]);
    assert.equal(sections[3].label, "References (4)");
    assert.equal(references[1].label, "Outbound (3)", "reference count did not count occurrences");

    active = otherVault;
    await otherVault.ensure();
    sections = await tree.getChildren();
    const otherDeadline = Date.now() + 5000;
    while (sections[1].label !== "inbox (1)") {
      if (Date.now() >= otherDeadline) throw new Error("second vault count did not become ready");
      await new Promise((resolve) => setTimeout(resolve, 25));
      sections = await tree.getChildren();
    }
    assert.deepEqual(
      sections.map((item) => item.label),
      ["Vaults (2)", "inbox (1)", "notes (1)", "References"],
    );
    assert.match(tree.message("References") ?? "", /belongs to.*existing-vault/);
    assert.deepEqual(await tree.getChildren(sections[3]), []);
    assert.notEqual((await tree.getChildren(sections[0]))[1].description, "Selected");
  } finally {
    tree.dispose();
    firstVault.dispose();
    otherVault.dispose();
  }

  const replacement = vscode.Uri.joinPath(root, "replacement");
  await vscode.workspace.fs.createDirectory(replacement);
  const replacementTarget = vscode.Uri.joinPath(replacement, "202601011200-note-1.md");
  await vscode.workspace.fs.writeFile(
    replacementTarget,
    Buffer.from("---\ntitle: Replacement\ntags: []\n---\n"),
  );
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(root, ".stemlink.json"),
    Buffer.from(JSON.stringify({ version: 1, inbox: "fleeting", notes: "replacement" })),
  );
  const deadline = Date.now() + 5000;
  while (true) {
    links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      "vscode.executeLinkProvider",
      first,
    );
    if (links?.some((link) => link.target?.toString() === replacementTarget.toString())) break;
    if (Date.now() >= deadline) throw new Error("marker change did not update the active vault");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const activeMarker = vscode.Uri.joinPath(root, ".stemlink.json");
  await vscode.workspace.fs.delete(activeMarker);
  const removalDeadline = Date.now() + 5000;
  while (true) {
    links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      "vscode.executeLinkProvider",
      first,
    );
    if (!links?.some((link) => link.target?.toString() === replacementTarget.toString())) break;
    if (Date.now() >= removalDeadline)
      throw new Error("marker deletion did not restore settings-based paths");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await vscode.workspace.fs.writeFile(
    activeMarker,
    Buffer.from(JSON.stringify({ version: 1, inbox: "fleeting", notes: "replacement" })),
  );
  const creationDeadline = Date.now() + 5000;
  while (true) {
    links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      "vscode.executeLinkProvider",
      first,
    );
    if (links?.some((link) => link.target?.toString() === replacementTarget.toString())) break;
    if (Date.now() >= creationDeadline) throw new Error("new marker was not discovered");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const fixture = vscode.Uri.joinPath(folder.uri, "test-data", "selection-fixture");
  const child = vscode.Uri.joinPath(fixture, "child");
  const nested = vscode.Uri.joinPath(child, "nested");
  await vscode.workspace.fs.createDirectory(nested);
  const marker = Buffer.from(JSON.stringify({ version: 1, inbox: "fleeting", notes: "stable" }));
  for (const uri of [fixture, child, nested]) {
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(uri, ".stemlink.json"), marker);
  }
  const testFolder: vscode.WorkspaceFolder = { uri: fixture, name: "selection-fixture", index: 0 };
  const found = await discoverVaults(testFolder);
  assert.deepEqual(
    found.map((value) => value.root.toString()),
    [fixture.toString(), child.toString()],
    "discovery must include the workspace root and direct children only",
  );

  const data = new Map<string, unknown>();
  const state = {
    get: <T>(key: string) => data.get(key) as T | undefined,
    update: async (key: string, value: unknown) => {
      data.set(key, value);
    },
  };
  const api = vscode.window as { showQuickPick: typeof vscode.window.showQuickPick };
  const original = api.showQuickPick;
  const workspaceApi = vscode.workspace as {
    getConfiguration: typeof vscode.workspace.getConfiguration;
  };
  const originalConfig = workspaceApi.getConfiguration;
  let prompts = 0;
  let cancel = false;
  let hasSettings = false;
  let legacyRoot = "child";
  let templateSetting: string | undefined;
  let useMarker = false;
  try {
    api.showQuickPick = new Proxy(original, {
      apply: (_target, _thisArg, args: unknown[]) => {
        prompts++;
        const items = args[0] as { detail: string }[];
        assert.equal(items.length, 2, "unexpected configuration choices");
        if (templateSetting)
          assert.ok(
            items[1].detail.includes(templateSetting),
            "configuration chooser omitted templates path",
          );
        return Promise.resolve(cancel ? undefined : items[useMarker ? 0 : 1]);
      },
    });
    workspaceApi.getConfiguration = new Proxy(originalConfig, {
      apply: (target, thisArg, args: Parameters<typeof vscode.workspace.getConfiguration>) => {
        const config = Reflect.apply(target, thisArg, args) as vscode.WorkspaceConfiguration;
        if (args[0] !== "stemlink" || args[1]?.toString() !== fixture.toString()) return config;
        const values: Record<string, string> = {
          root: legacyRoot,
          inbox: "legacy-inbox",
          notes: "legacy-notes",
          ...(templateSetting ? { templates: templateSetting } : {}),
        };
        return {
          get: (key: string, fallback: unknown) => values[key] ?? fallback,
          inspect: (key: string) =>
            key === "templates"
              ? templateSetting === undefined
                ? undefined
                : { workspaceValue: templateSetting }
              : hasSettings
                ? { workspaceValue: true }
                : undefined,
        };
      },
    });
    assert.equal(
      (await resolveVaultPaths(testFolder, state)).length,
      2,
      "multiple markers were not all retained",
    );
    assert.equal(prompts, 0, "multiple vaults triggered a selection prompt");
    legacyRoot = "legacy";
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(fixture, legacyRoot, "legacy-inbox"),
    );
    assert.equal(
      (await resolveVaultPaths(testFolder, state)).length,
      2,
      "incomplete default folder became a vault",
    );
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(fixture, legacyRoot, "legacy-notes"),
    );
    assert.equal(
      (await resolveVaultPaths(testFolder, state)).length,
      3,
      "existing default vault was hidden by unrelated markers",
    );
    legacyRoot = "child";
    hasSettings = true;
    assert.equal(
      (await resolveVaultPaths(testFolder, state))[1].inbox.path,
      `${child.path}/legacy-inbox`,
    );
    assert.equal(
      (await resolveVaultPaths(testFolder, state))[1].inbox.path,
      `${child.path}/legacy-inbox`,
    );
    assert.equal(prompts, 1, "unchanged configuration choice was not remembered");
    data.clear();
    cancel = true;
    assert.deepEqual(
      (await resolveVaultPaths(testFolder, state)).map((value) => value.root.toString()),
      [fixture.toString()],
      "cancelled configuration conflict hid an unrelated vault",
    );
    cancel = false;
    const childMarker = vscode.Uri.joinPath(child, ".stemlink.json");
    const customMarker = Buffer.from(
      JSON.stringify({
        version: 1,
        inbox: "legacy-inbox",
        notes: "legacy-notes",
        templates: "marker-examples",
      }),
    );
    await vscode.workspace.fs.writeFile(childMarker, customMarker);
    assert.equal(
      (await resolveVaultPaths(testFolder, state))[1].templates.path,
      `${child.path}/marker-examples`,
      "unset templates setting replaced marker mapping",
    );
    hasSettings = false;
    templateSetting = "configured-examples";
    const promptsBeforeTemplates = prompts;
    assert.equal(
      (await resolveVaultPaths(testFolder, state))[1].templates.path,
      `${child.path}/configured-examples`,
      "explicit templates-only setting was ignored",
    );
    await resolveVaultPaths(testFolder, state);
    assert.equal(
      prompts,
      promptsBeforeTemplates + 1,
      "templates configuration choice was not remembered",
    );
    data.clear();
    useMarker = true;
    assert.equal(
      (await resolveVaultPaths(testFolder, state))[1].templates.path,
      `${child.path}/marker-examples`,
      "choosing marker did not retain templates mapping",
    );
    assert.deepEqual(
      await vscode.workspace.fs.readFile(childMarker),
      customMarker,
      "resolving settings conflict rewrote marker",
    );
  } finally {
    api.showQuickPick = original;
    workspaceApi.getConfiguration = originalConfig;
  }
  const fixtureMarker = vscode.Uri.joinPath(fixture, ".stemlink.json");
  assert.equal(
    (await readVaultMarker(fixture))?.templates.toString(),
    vscode.Uri.joinPath(fixture, "templates").toString(),
    "legacy marker did not default templates folder",
  );
  await vscode.workspace.fs.writeFile(
    fixtureMarker,
    Buffer.from(
      JSON.stringify({ version: 1, inbox: "fleeting", notes: "stable", templates: "examples" }),
    ),
  );
  assert.equal(
    (await readVaultMarker(fixture))?.templates.toString(),
    vscode.Uri.joinPath(fixture, "examples").toString(),
    "custom templates mapping was ignored",
  );
  for (const invalid of [
    "{",
    JSON.stringify({ version: 2, inbox: "fleeting", notes: "stable" }),
    JSON.stringify({ version: 1, inbox: "../outside", notes: "stable" }),
    JSON.stringify({ version: 1, inbox: "same", notes: "SAME" }),
    ...["", "../outside", "nested/templates", "STABLE", "FLEETING", null, 3].map((templates) =>
      JSON.stringify({ version: 1, inbox: "fleeting", notes: "stable", templates }),
    ),
  ]) {
    await vscode.workspace.fs.writeFile(fixtureMarker, Buffer.from(invalid));
    await assert.rejects(() => readVaultMarker(fixture), /Invalid .*\.stemlink\.json/);
  }
  await vscode.workspace.fs.writeFile(fixtureMarker, marker);
}

async function testOpenVault(folder: vscode.WorkspaceFolder): Promise<void> {
  const root = vscode.Uri.joinPath(folder.uri, "open-vault");
  const inbox = vscode.Uri.joinPath(root, "captures");
  const notes = vscode.Uri.joinPath(root, "permanent");
  const marker = vscode.Uri.joinPath(root, ".stemlink.json");
  await vscode.workspace.fs.createDirectory(inbox);
  await vscode.workspace.fs.createDirectory(notes);
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(notes, "_fleeting.md"),
    Buffer.from("Preserved template.\n"),
  );
  const rootIndex = vscode.Uri.joinPath(root, routerIndexName);
  const inboxIndex = vscode.Uri.joinPath(inbox, routerIndexName);
  await vscode.workspace.fs.writeFile(rootIndex, Buffer.from("User-owned vault index.\n"));
  await vscode.workspace.fs.writeFile(inboxIndex, Buffer.from("User-owned inbox index.\n"));
  const rootInstructions = vscode.Uri.joinPath(root, "AGENTS.md");
  const inboxInstructions = vscode.Uri.joinPath(inbox, "AGENTS.md");
  await vscode.workspace.fs.writeFile(
    rootInstructions,
    Buffer.from("User-owned root instructions.\n"),
  );
  await vscode.workspace.fs.writeFile(
    inboxInstructions,
    Buffer.from("User-owned inbox instructions.\n"),
  );
  const api = vscode.window as {
    showOpenDialog: typeof vscode.window.showOpenDialog;
    showWarningMessage: typeof vscode.window.showWarningMessage;
    showQuickPick: typeof vscode.window.showQuickPick;
    showErrorMessage: typeof vscode.window.showErrorMessage;
  };
  const original = {
    showOpenDialog: api.showOpenDialog,
    showWarningMessage: api.showWarningMessage,
    showQuickPick: api.showQuickPick,
    showErrorMessage: api.showErrorMessage,
  };
  let chosen: vscode.Uri | undefined;
  let confirm = false;
  let answers: (string | undefined)[] = [];
  let warnings = 0;
  const instructionPrompts: string[] = [];
  const errors: string[] = [];
  const settings = vscode.workspace.getConfiguration("stemlink", folder.uri).get("root");
  const workspaceApi = vscode.workspace as {
    getConfiguration: typeof vscode.workspace.getConfiguration;
  };
  const originalConfig = workspaceApi.getConfiguration;
  const missingMarker = async () => {
    await assert.rejects(
      async () => vscode.workspace.fs.stat(marker),
      (error: unknown) => error instanceof vscode.FileSystemError && error.code === "FileNotFound",
    );
  };
  try {
    workspaceApi.getConfiguration = new Proxy(originalConfig, {
      apply: (target, thisArg, args: Parameters<typeof vscode.workspace.getConfiguration>) => {
        const config = Reflect.apply(target, thisArg, args) as vscode.WorkspaceConfiguration;
        if (args[0] !== "stemlink" || args[1]?.toString() !== root.toString()) return config;
        return {
          get: (key: string, fallback: unknown) =>
            key === "templates" ? "examples" : config.get(key, fallback),
        };
      },
    });
    api.showOpenDialog = async (options) => {
      assert.equal(options?.title, "Open vault");
      return chosen ? [chosen] : undefined;
    };
    api.showWarningMessage = new Proxy(original.showWarningMessage, {
      apply: (_target, _thisArg, args: unknown[]) => {
        const message = String(args[0]);
        if (message.includes("AGENTS.md")) {
          instructionPrompts.push(message);
          return Promise.resolve("Add");
        }
        if (message.includes(".stemlink.json")) {
          warnings++;
          return Promise.resolve(confirm ? "Add Marker" : undefined);
        }
        return Promise.resolve(undefined);
      },
    });
    api.showQuickPick = new Proxy(original.showQuickPick, {
      apply: (_target, _thisArg, args: unknown[]) => {
        const items = args[0] as { label: string }[];
        assert.ok(answers.length, "unexpected folder prompt");
        const answer = answers.shift();
        if (answer === "permanent")
          assert.ok(
            !items.some((item) => item.label === "captures"),
            "inbox was offered as the notes folder",
          );
        return Promise.resolve(items.find((item) => item.label === answer));
      },
    });
    api.showErrorMessage = new Proxy(original.showErrorMessage, {
      apply: (_target, _thisArg, args: unknown[]) => {
        errors.push(String(args[0]));
        return Promise.resolve(undefined);
      },
    });
    await vscode.commands.executeCommand("stemlink.openVault");
    assert.equal(warnings, 0, "cancelled folder dialog prompted for a marker");
    chosen = root;
    await vscode.commands.executeCommand("stemlink.openVault");
    await missingMarker();
    assert.equal(
      vscode.workspace.workspaceFolders?.length,
      1,
      "declined marker added a workspace folder",
    );
    confirm = true;
    for (const cancelled of [[undefined], ["captures", undefined]]) {
      answers = cancelled;
      await vscode.commands.executeCommand("stemlink.openVault");
      await missingMarker();
    }
    answers = ["captures", "permanent"];
    await vscode.commands.executeCommand("stemlink.openVault");
    assert.equal(answers.length, 0);
    assert.deepEqual(
      JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(marker)).toString("utf8")),
      { version: 1, inbox: "captures", notes: "permanent", templates: "examples" },
    );
    assert.equal(
      Buffer.from(await vscode.workspace.fs.readFile(rootIndex)).toString("utf8"),
      "User-owned vault index.\n",
      "opening replaced an existing vault index",
    );
    assert.equal(
      Buffer.from(await vscode.workspace.fs.readFile(inboxIndex)).toString("utf8"),
      "User-owned inbox index.\n",
      "opening replaced an existing inbox index",
    );
    assert.equal(
      Buffer.from(await vscode.workspace.fs.readFile(rootInstructions)).toString("utf8"),
      "User-owned root instructions.\n",
      "opening replaced existing root instructions",
    );
    assert.equal(
      Buffer.from(await vscode.workspace.fs.readFile(inboxInstructions)).toString("utf8"),
      "User-owned inbox instructions.\n",
      "opening replaced existing inbox instructions",
    );
    assert.match(
      instructionPrompts[0] ?? "",
      /permanent\/AGENTS\.md/,
      `open prompt included existing agent instructions or omitted missing ones: ${JSON.stringify({ instructionPrompts, errors })}`,
    );
    const notesInstructions = Buffer.from(
      await vscode.workspace.fs.readFile(vscode.Uri.joinPath(notes, "AGENTS.md")),
    ).toString("utf8");
    assert.match(
      notesInstructions,
      /permanent\/.*one idea per note/,
      "Open vault instructions omitted configured notes folder",
    );
    assert.ok(
      notesInstructions.includes("`examples/`"),
      "Open vault ignored configured templates folder",
    );
    await assert.rejects(
      async () => vscode.workspace.fs.stat(vscode.Uri.joinPath(root, "examples")),
      (error: unknown) => error instanceof vscode.FileSystemError && error.code === "FileNotFound",
      "Open vault installed templates in an existing vault",
    );
    assert.equal(instructionPrompts.length, 1);
    const inputApi = vscode.window as { showInputBox: typeof vscode.window.showInputBox };
    const originalInput = inputApi.showInputBox;
    let promotionPrompts = 0;
    const errorsBeforePromotion = errors.length;
    inputApi.showInputBox = async () => {
      promotionPrompts++;
      return "Incorrect promotion";
    };
    try {
      await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument(inboxInstructions),
      );
      await vscode.commands.executeCommand("stemlink.promote", { uri: inboxInstructions });
    } finally {
      inputApi.showInputBox = originalInput;
    }
    assert.equal(promotionPrompts, 0, "agent instructions were offered for promotion");
    assert.ok(
      errors
        .slice(errorsBeforePromotion)
        .some((message) => message.includes("Select an inbox Markdown capture")),
      "promoting agent instructions did not report the invalid selection",
    );
    errors.splice(errorsBeforePromotion);
    const openNotesIndex = Buffer.from(
      await vscode.workspace.fs.readFile(vscode.Uri.joinPath(notes, routerIndexName)),
    ).toString("utf8");
    assert.match(openNotesIndex, /# Notes router: `permanent\/`/);
    assert.match(openNotesIndex, /\[Inbox `captures\/` \(0 captures\)\]/);
    assert.equal(
      vscode.workspace.workspaceFolders?.length,
      1,
      "discoverable vault was added to the workspace",
    );
    assert.equal(
      vscode.workspace.getConfiguration("stemlink", folder.uri).get("root"),
      settings,
      "opening a vault changed legacy settings",
    );
    await vscode.commands.executeCommand("stemlink.addFleetingNote");
    assert.equal(
      vscode.window.activeTextEditor?.document.getText().replace(/\r\n/g, "\n"),
      "Preserved template.\n",
      "Open vault did not fall back to the legacy notes template",
    );
    assert.equal(
      errors.length,
      0,
      `opening or using the vault reported an error: ${errors.join("; ")}`,
    );
    assert.equal(
      (await vscode.workspace.fs.readDirectory(inbox)).filter(
        ([name]) => !isVaultInstructionFile(name),
      ).length,
      1,
      "opened vault was not selected",
    );
    const incompleteRoot = vscode.Uri.joinPath(folder.uri, "incomplete-vault");
    const incompleteInbox = vscode.Uri.joinPath(incompleteRoot, "inbox");
    await vscode.workspace.fs.createDirectory(incompleteInbox);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(incompleteRoot, ".stemlink.json"),
      Buffer.from(JSON.stringify({ version: 1, inbox: "inbox", notes: "notes" })),
    );
    chosen = incompleteRoot;
    await vscode.commands.executeCommand("stemlink.openVault");
    assert.match(instructionPrompts[1] ?? "", /vault root\/AGENTS\.md[\s\S]*inbox\/AGENTS\.md/);
    assert.match(
      instructionPrompts[1] ?? "",
      /Missing configured folders will not be created: notes/,
    );
    await assert.rejects(
      async () => vscode.workspace.fs.stat(vscode.Uri.joinPath(incompleteRoot, "notes")),
      (error: unknown) => error instanceof vscode.FileSystemError && error.code === "FileNotFound",
      "Open vault created a missing configured folder",
    );
    assert.ok(
      (await vscode.workspace.fs.stat(vscode.Uri.joinPath(incompleteInbox, "AGENTS.md"))).type &
        vscode.FileType.File,
    );
    assert.ok(
      (await vscode.workspace.fs.stat(vscode.Uri.joinPath(incompleteRoot, "AGENTS.md"))).type &
        vscode.FileType.File,
    );
    const bytes = await vscode.workspace.fs.readFile(marker);
    const warningCount = warnings;
    const instructionPromptCount = instructionPrompts.length;
    await vscode.commands.executeCommand("stemlink.openVault");
    assert.equal(warnings, warningCount, "existing marker prompted for replacement");
    assert.equal(
      instructionPrompts.length,
      instructionPromptCount,
      "existing instructions prompted for replacement",
    );
    assert.deepEqual(
      await vscode.workspace.fs.readFile(marker),
      bytes,
      "existing marker was overwritten",
    );
    assert.equal(
      vscode.workspace.workspaceFolders?.length,
      1,
      "discoverable vault was added unnecessarily",
    );
    chosen = vscode.Uri.joinPath(folder.uri, "other-vault");
    await vscode.commands.executeCommand("stemlink.openVault");
    assert.equal(
      vscode.workspace.workspaceFolders?.length,
      1,
      "discoverable child was added unnecessarily",
    );
    await vscode.commands.executeCommand("stemlink.addFleetingNote");
    assert.equal(
      (await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(chosen, "inbox"))).filter(
        ([name]) => !isVaultInstructionFile(name),
      ).length,
      2,
      "existing discovered vault was not selected",
    );
    chosen = vscode.Uri.joinPath(folder.uri, "test-data", "bad-vault");
    await vscode.workspace.fs.createDirectory(chosen);
    const badMarker = vscode.Uri.joinPath(chosen, ".stemlink.json");
    await vscode.commands.executeCommand("stemlink.openVault");
    assert.ok(
      errors.some((message) => message.includes("two distinct existing folders")),
      "missing capture and note directories were not reported",
    );
    await assert.rejects(async () => vscode.workspace.fs.stat(badMarker));
    await vscode.workspace.fs.writeFile(badMarker, Buffer.from("{"));
    await vscode.commands.executeCommand("stemlink.openVault");
    assert.ok(
      errors.some((message) => message.includes("Invalid") && message.includes(".stemlink.json")),
      "invalid marker error was hidden",
    );
    assert.equal(Buffer.from(await vscode.workspace.fs.readFile(badMarker)).toString(), "{");
    assert.equal(
      vscode.workspace.workspaceFolders?.length,
      1,
      "invalid vault was added to the workspace",
    );
  } finally {
    workspaceApi.getConfiguration = originalConfig;
    api.showOpenDialog = original.showOpenDialog;
    api.showWarningMessage = original.showWarningMessage;
    api.showQuickPick = original.showQuickPick;
    api.showErrorMessage = original.showErrorMessage;
  }
}

async function testFeatureSettings(folder: vscode.WorkspaceFolder): Promise<void> {
  const config = vscode.workspace.getConfiguration("stemlink", folder.uri);
  const previousRouterSetting = config.inspect<boolean>("enableRouterIndexes")?.workspaceValue;
  const previousAgentSetting = config.inspect<boolean>("offerAgentInstructions")?.workspaceValue;
  const previousPaths = {
    root: config.inspect<string>("root")?.workspaceValue,
    inbox: config.inspect<string>("inbox")?.workspaceValue,
    notes: config.inspect<string>("notes")?.workspaceValue,
    templates: config.inspect<string>("templates")?.workspaceValue,
  };
  const root = vscode.Uri.joinPath(folder.uri, "settings-vault");
  const inbox = vscode.Uri.joinPath(root, "inbox");
  const notes = vscode.Uri.joinPath(root, "notes");
  const rootIndex = vscode.Uri.joinPath(root, routerIndexName);
  const inboxIndex = vscode.Uri.joinPath(inbox, routerIndexName);
  const notesIndex = vscode.Uri.joinPath(notes, routerIndexName);
  const instructions = [root, inbox, notes].map((directory) =>
    vscode.Uri.joinPath(directory, "AGENTS.md"),
  );
  const indexBefore = Buffer.from(
    renderRouterIndexes("settings-vault", "inbox", "notes", [], []).root,
  );
  const api = vscode.window as {
    showInputBox: typeof vscode.window.showInputBox;
    showOpenDialog: typeof vscode.window.showOpenDialog;
    showWorkspaceFolderPick: typeof vscode.window.showWorkspaceFolderPick;
    showWarningMessage: typeof vscode.window.showWarningMessage;
  };
  const originalInput = api.showInputBox;
  const originalOpen = api.showOpenDialog;
  const originalWorkspaceFolderPick = api.showWorkspaceFolderPick;
  const originalWarning = api.showWarningMessage;
  let instructionPrompts = 0;
  try {
    await vscode.workspace.fs.createDirectory(inbox);
    await vscode.workspace.fs.createDirectory(notes);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(root, ".stemlink.json"),
      Buffer.from(JSON.stringify({ version: 1, inbox: "inbox", notes: "notes" })),
    );
    await vscode.workspace.fs.writeFile(rootIndex, indexBefore);
    await config.update("enableRouterIndexes", false, vscode.ConfigurationTarget.Workspace);
    await config.update("offerAgentInstructions", false, vscode.ConfigurationTarget.Workspace);
    api.showOpenDialog = async () => [root];
    api.showWarningMessage = new Proxy(originalWarning, {
      apply: (_target, _thisArg, args: unknown[]) => {
        const message = String(args[0]);
        if (message.includes("AGENTS.md")) {
          instructionPrompts++;
          return Promise.resolve("Add");
        }
        return Promise.resolve(message.includes("Reuse the folder") ? "Continue" : undefined);
      },
    });

    await vscode.commands.executeCommand("stemlink.openVault");
    assert.equal(instructionPrompts, 0, "disabled agent-instruction setting still prompted");
    assert.deepEqual(
      await vscode.workspace.fs.readFile(rootIndex),
      indexBefore,
      "disabled router setting modified an existing router",
    );
    for (const uri of [inboxIndex, notesIndex, ...instructions]) {
      await assert.rejects(
        async () => vscode.workspace.fs.stat(uri),
        (error: unknown) =>
          error instanceof vscode.FileSystemError && error.code === "FileNotFound",
        `disabled settings created ${uri.path}`,
      );
    }

    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(inbox, "capture.md"),
      Buffer.from("Capture\n"),
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.deepEqual(
      await vscode.workspace.fs.readFile(rootIndex),
      indexBefore,
      "disabled router setting refreshed an existing router",
    );

    await config.update("enableRouterIndexes", true, vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand("stemlink.openVault");
    await waitForFileText(
      rootIndex,
      (text) => text.includes("Inbox `inbox/` (1 captures)"),
      "enabling router setting did not initialize the router on Open vault",
    );
    for (const uri of [inboxIndex, notesIndex]) {
      assert.ok(
        (await vscode.workspace.fs.stat(uri)).type & vscode.FileType.File,
        "enabled router setting did not create a missing index",
      );
    }
    for (const uri of instructions) {
      await assert.rejects(
        async () => vscode.workspace.fs.stat(uri),
        (error: unknown) =>
          error instanceof vscode.FileSystemError && error.code === "FileNotFound",
        "disabled agent-instruction setting installed a file",
      );
    }

    await config.update("offerAgentInstructions", true, vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand("stemlink.openVault");
    assert.equal(instructionPrompts, 1, "enabling agent-instruction setting did not prompt");
    for (const uri of instructions) {
      assert.ok(
        (await vscode.workspace.fs.stat(uri)).type & vscode.FileType.File,
        "accepted agent-instruction prompt did not create a missing file",
      );
    }

    await config.update("enableRouterIndexes", false, vscode.ConfigurationTarget.Workspace);
    await config.update("offerAgentInstructions", false, vscode.ConfigurationTarget.Workspace);
    const createAnswers = ["settings-created", "inbox", "notes"];
    api.showInputBox = async () => createAnswers.shift();
    api.showWorkspaceFolderPick = async () => folder;
    await vscode.commands.executeCommand("stemlink.createVault");
    assert.equal(createAnswers.length, 0, "Create did not request its folder names");
    const createdRoot = vscode.Uri.joinPath(folder.uri, "settings-created");
    for (const directory of [
      createdRoot,
      vscode.Uri.joinPath(createdRoot, "inbox"),
      vscode.Uri.joinPath(createdRoot, "notes"),
    ]) {
      for (const name of [routerIndexName, "AGENTS.md"]) {
        await assert.rejects(
          async () => vscode.workspace.fs.stat(vscode.Uri.joinPath(directory, name)),
          (error: unknown) =>
            error instanceof vscode.FileSystemError && error.code === "FileNotFound",
          `Create ignored disabled setting for ${name}`,
        );
      }
    }
  } finally {
    api.showInputBox = originalInput;
    api.showOpenDialog = originalOpen;
    api.showWorkspaceFolderPick = originalWorkspaceFolderPick;
    api.showWarningMessage = originalWarning;
    await config.update(
      "enableRouterIndexes",
      previousRouterSetting,
      vscode.ConfigurationTarget.Workspace,
    );
    await config.update(
      "offerAgentInstructions",
      previousAgentSetting,
      vscode.ConfigurationTarget.Workspace,
    );
    await config.update("root", previousPaths.root, vscode.ConfigurationTarget.Workspace);
    await config.update("inbox", previousPaths.inbox, vscode.ConfigurationTarget.Workspace);
    await config.update("notes", previousPaths.notes, vscode.ConfigurationTarget.Workspace);
    await config.update("templates", previousPaths.templates, vscode.ConfigurationTarget.Workspace);
  }
}

async function testDynamicVaultFiles(
  folder: vscode.WorkspaceFolder,
  extensionUri: vscode.Uri,
): Promise<void> {
  const cases = [
    { root: "notes", inbox: "inbox", notes: "permanent" },
    { root: "zk", inbox: "inbox", notes: "notes" },
    { root: "Stemlink vault", inbox: "Fleeting", notes: "Permanent" },
    { root: "vault", inbox: "Inbox", notes: "Knowledge" },
    { root: "configured-vault", inbox: "templates", notes: "knowledge", templates: "examples" },
  ] as const;
  const config = vscode.workspace.getConfiguration("stemlink", folder.uri);
  const previous = {
    root: config.inspect<string>("root")?.workspaceValue,
    inbox: config.inspect<string>("inbox")?.workspaceValue,
    notes: config.inspect<string>("notes")?.workspaceValue,
    templates: config.inspect<string>("templates")?.workspaceValue,
    enableRouterIndexes: config.inspect<boolean>("enableRouterIndexes")?.workspaceValue,
    offerAgentInstructions: config.inspect<boolean>("offerAgentInstructions")?.workspaceValue,
  };
  const api = vscode.window as {
    showInputBox: typeof vscode.window.showInputBox;
    showWorkspaceFolderPick: typeof vscode.window.showWorkspaceFolderPick;
    showWarningMessage: typeof vscode.window.showWarningMessage;
    showErrorMessage: typeof vscode.window.showErrorMessage;
  };
  const original = {
    showInputBox: api.showInputBox,
    showWorkspaceFolderPick: api.showWorkspaceFolderPick,
    showWarningMessage: api.showWarningMessage,
    showErrorMessage: api.showErrorMessage,
  };
  const errors: string[] = [];
  try {
    await config.update("enableRouterIndexes", true, vscode.ConfigurationTarget.Workspace);
    await config.update("offerAgentInstructions", true, vscode.ConfigurationTarget.Workspace);
    api.showWorkspaceFolderPick = async () => folder;
    api.showWarningMessage = new Proxy(original.showWarningMessage, {
      apply: (_target, _thisArg, args: unknown[]) => {
        const message = String(args[0]);
        if (message.includes("AGENTS.md")) return Promise.resolve("Add");
        if (message.includes("Stemlink workspace settings already exist"))
          return Promise.resolve("Continue");
        return Promise.resolve(undefined);
      },
    });
    api.showErrorMessage = new Proxy(original.showErrorMessage, {
      apply: (_target, _thisArg, args: unknown[]) => {
        errors.push(String(args[0]));
        return Promise.resolve(undefined);
      },
    });

    for (const scenario of cases) {
      const templatesName = "templates" in scenario ? scenario.templates : "templates";
      if ("templates" in scenario) {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, scenario.root));
        for (const key of ["root", "templates", "inbox", "notes"] as const) {
          await config.update(key, scenario[key], vscode.ConfigurationTarget.Workspace);
        }
      }
      const answers = [scenario.root, scenario.inbox, scenario.notes];
      api.showInputBox = async (options) => {
        assert.ok(answers.length, "unexpected input prompt during synthetic vault creation");
        const answer = answers.shift();
        if (scenario.root === "notes" || "templates" in scenario) {
          assert.equal(options?.value, answer, "new-vault prompt did not offer the default layout");
          return options?.value;
        }
        return answer;
      };
      await vscode.commands.executeCommand("stemlink.createVault");
      assert.equal(
        answers.length,
        0,
        `${scenario.root} creation did not request every folder name`,
      );
      assert.equal(errors.length, 0, `${scenario.root} creation failed: ${errors.join("; ")}`);

      const root = vscode.Uri.joinPath(folder.uri, scenario.root);
      const inbox = vscode.Uri.joinPath(root, scenario.inbox);
      const notes = vscode.Uri.joinPath(root, scenario.notes);
      const templates = vscode.Uri.joinPath(root, templatesName);
      const readText = async (uri: vscode.Uri) =>
        Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
      const marker = JSON.parse(await readText(vscode.Uri.joinPath(root, ".stemlink.json")));
      assert.deepEqual(marker, {
        version: 1,
        inbox: scenario.inbox,
        notes: scenario.notes,
        templates: templatesName,
      });
      for (const directory of [inbox, notes, templates]) {
        assert.ok(
          (await vscode.workspace.fs.stat(directory)).type & vscode.FileType.Directory,
          `${directory.path} was not created`,
        );
      }

      const manual = await readText(vscode.Uri.joinPath(root, "README.md"));
      for (const expected of [
        `Vault root: \`${scenario.root}/\``,
        `Captures: \`${scenario.inbox}/\``,
        `Permanent notes: \`${scenario.notes}/\``,
        `Editable examples: \`${templatesName}/\``,
      ])
        assert.ok(manual.includes(expected), `${scenario.root} manual omitted ${expected}`);
      assert.ok(
        !manual.includes("<!-- stemlink:configured-folders -->"),
        `${scenario.root} manual retained its render marker`,
      );

      const rootInstructions = await readText(vscode.Uri.joinPath(root, "AGENTS.md"));
      const inboxInstructions = await readText(vscode.Uri.joinPath(inbox, "AGENTS.md"));
      const notesInstructions = await readText(vscode.Uri.joinPath(notes, "AGENTS.md"));
      for (const expected of [
        `Vault root: \`${scenario.root}/\``,
        `Capture folder: \`${scenario.inbox}/\``,
        `Permanent-note folder: \`${scenario.notes}/\``,
        `Editable examples: \`${templatesName}/\``,
      ]) {
        assert.ok(
          rootInstructions.includes(expected),
          `${scenario.root} root instructions omitted ${expected}`,
        );
      }
      assert.ok(
        inboxInstructions.includes(`\`${scenario.inbox}/\``),
        `${scenario.root} inbox instructions omitted configured capture folder`,
      );
      assert.ok(
        notesInstructions.includes(`\`${scenario.notes}/\``),
        `${scenario.root} notes instructions omitted configured permanent-note folder`,
      );

      const rootIndex = await readText(vscode.Uri.joinPath(root, routerIndexName));
      const inboxIndex = await readText(vscode.Uri.joinPath(inbox, routerIndexName));
      const notesIndex = await readText(vscode.Uri.joinPath(notes, routerIndexName));
      for (const expected of [`${scenario.root}/`, `${scenario.inbox}/`, `${scenario.notes}/`]) {
        assert.ok(rootIndex.includes(expected), `${scenario.root} root index omitted ${expected}`);
      }
      assert.ok(
        inboxIndex.includes(`${scenario.inbox}/`) && inboxIndex.includes(`${scenario.notes}/`),
        `${scenario.root} inbox index omitted configured folder names`,
      );
      assert.ok(
        notesIndex.includes(`${scenario.notes}/`) && notesIndex.includes(`${scenario.inbox}/`),
        `${scenario.root} notes index omitted configured folder names`,
      );

      const templateNames = (await vscode.workspace.fs.readDirectory(templates))
        .map(([name]) => name)
        .sort();
      assert.deepEqual(
        templateNames,
        ["_fleeting.md", "_promotion.md", "_template.md"],
        `${scenario.root} did not receive editable examples`,
      );
      for (const name of templateNames) {
        assert.deepEqual(
          await vscode.workspace.fs.readFile(vscode.Uri.joinPath(templates, name)),
          await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, "templates", name)),
          `${scenario.root} changed bundled example ${name}`,
        );
      }
      if ("templates" in scenario) {
        await vscode.commands.executeCommand("stemlink.addFleetingNote");
        assert.equal(
          vscode.window.activeTextEditor?.document.getText().replace(/\r\n/g, "\n"),
          (await readText(vscode.Uri.joinPath(templates, "_fleeting.md"))).replace(/\r\n/g, "\n"),
          "capture creation ignored configured templates folder",
        );
        await assert.rejects(
          async () => vscode.workspace.fs.stat(vscode.Uri.joinPath(inbox, "_fleeting.md")),
          (error: unknown) =>
            error instanceof vscode.FileSystemError && error.code === "FileNotFound",
          "configured creation installed a template in the capture folder named templates",
        );
      }
    }
    const root = vscode.Uri.joinPath(folder.uri, "vault");
    const customTemplates = vscode.Uri.joinPath(root, "examples");
    await vscode.workspace.fs.rename(vscode.Uri.joinPath(root, "templates"), customTemplates);
    const captureText = "Capture from mapped templates folder.\n";
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(customTemplates, "_fleeting.md"),
      Buffer.from(captureText),
    );
    const markerUri = vscode.Uri.joinPath(root, ".stemlink.json");
    const markerText = `${JSON.stringify(
      {
        version: 1,
        inbox: "Inbox",
        notes: "Knowledge",
        templates: "examples",
      },
      null,
      2,
    )}\n`;
    const markerDocument = await vscode.workspace.openTextDocument(markerUri);
    const markerEdit = new vscode.WorkspaceEdit();
    markerEdit.replace(
      markerUri,
      new vscode.Range(
        new vscode.Position(0, 0),
        markerDocument.positionAt(markerDocument.getText().length),
      ),
      markerText,
    );
    assert.equal(await vscode.workspace.applyEdit(markerEdit), true);
    assert.equal(await markerDocument.save(), true);
    const savedMarker = await vscode.workspace.fs.readFile(markerUri);
    for (const directory of [root, vscode.Uri.joinPath(root, "Knowledge")]) {
      await vscode.workspace.fs.delete(vscode.Uri.joinPath(directory, "AGENTS.md"));
    }
    const openApi = vscode.window as { showOpenDialog: typeof vscode.window.showOpenDialog };
    const originalOpen = openApi.showOpenDialog;
    try {
      openApi.showOpenDialog = async () => [root];
      await vscode.commands.executeCommand("stemlink.openVault");
      await vscode.commands.executeCommand("stemlink.addFleetingNote");
      assert.equal(
        vscode.window.activeTextEditor?.document.getText().replace(/\r\n/g, "\n"),
        captureText,
        "New fleeting note ignored mapped templates directory",
      );
      for (const directory of [root, vscode.Uri.joinPath(root, "Knowledge")]) {
        const instructions = Buffer.from(
          await vscode.workspace.fs.readFile(vscode.Uri.joinPath(directory, "AGENTS.md")),
        ).toString("utf8");
        assert.ok(
          instructions.includes("`examples/`"),
          "agent instructions ignored templates mapping",
        );
        const router = Buffer.from(
          await vscode.workspace.fs.readFile(vscode.Uri.joinPath(directory, "INDEX.md")),
        ).toString("utf8");
        assert.ok(router.includes("`examples/`"), "router ignored templates mapping");
      }
      assert.deepEqual(
        await vscode.workspace.fs.readFile(markerUri),
        savedMarker,
        "Open vault rewrote templates mapping",
      );
      assert.equal(errors.length, 0, `mapped templates workflow failed: ${errors.join("; ")}`);
    } finally {
      openApi.showOpenDialog = originalOpen;
    }
  } finally {
    api.showInputBox = original.showInputBox;
    api.showWorkspaceFolderPick = original.showWorkspaceFolderPick;
    api.showWarningMessage = original.showWarningMessage;
    api.showErrorMessage = original.showErrorMessage;
    await config.update("root", previous.root, vscode.ConfigurationTarget.Workspace);
    await config.update("inbox", previous.inbox, vscode.ConfigurationTarget.Workspace);
    await config.update("notes", previous.notes, vscode.ConfigurationTarget.Workspace);
    await config.update("templates", previous.templates, vscode.ConfigurationTarget.Workspace);
    await config.update(
      "enableRouterIndexes",
      previous.enableRouterIndexes,
      vscode.ConfigurationTarget.Workspace,
    );
    await config.update(
      "offerAgentInstructions",
      previous.offerAgentInstructions,
      vscode.ConfigurationTarget.Workspace,
    );
  }
}

async function testNativeVaultSelection(
  folder: vscode.WorkspaceFolder,
  view: vscode.TreeView<Item>,
  provider: vscode.TreeDataProvider<Item>,
): Promise<void> {
  const firstRoot = vscode.Uri.joinPath(folder.uri, "existing-vault");
  const secondRoot = vscode.Uri.joinPath(folder.uri, "other-vault");
  assert.deepEqual(
    view.badge,
    { value: 2, tooltip: "2 vaults" },
    "initial vault badge was incorrect",
  );
  await vscode.commands.executeCommand("stemlink.vaults.focus");
  await waitFor(
    () => view.selection[0]?.vault?.paths.root.toString() === firstRoot.toString(),
    "first vault was not natively selected on open",
  );
  const originalReveal = view.reveal;
  let failedReveal = false;
  view.reveal = async (item, options) => {
    if (!failedReveal && item.vault?.paths.root.toString() === secondRoot.toString()) {
      failedReveal = true;
      throw new Error("Injected tree refresh race");
    }
    return originalReveal.call(view, item, options);
  };
  try {
    await vscode.commands.executeCommand("stemlink.selectVault", secondRoot);
    assert.ok(failedReveal, "tree refresh race was not injected");
    await waitFor(
      () => view.selection[0]?.vault?.paths.root.toString() === secondRoot.toString(),
      "vault selection did not recover from a tree refresh race",
    );
    await vscode.commands.executeCommand("stemlink.selectVault", firstRoot);
  } finally {
    view.reveal = originalReveal;
  }
  let releaseReveal: () => void = () => {};
  const revealGate = new Promise<void>((resolve) => {
    releaseReveal = resolve;
  });
  let delayedReveal = false;
  let staleSelection = false;
  const staleListener = view.onDidChangeSelection((event) => {
    if (event.selection[0]?.vault?.paths.root.toString() === secondRoot.toString())
      staleSelection = true;
  });
  view.reveal = async (item, options) => {
    if (!delayedReveal && item.vault?.paths.root.toString() === secondRoot.toString()) {
      delayedReveal = true;
      await revealGate;
    }
    return originalReveal.call(view, item, options);
  };
  try {
    const selectingSecond = vscode.commands.executeCommand("stemlink.selectVault", secondRoot);
    await waitFor(() => delayedReveal, "vault reveal did not start");
    const selectingFirst = vscode.commands.executeCommand("stemlink.selectVault", firstRoot);
    releaseReveal();
    await Promise.all([selectingSecond, selectingFirst]);
    await waitFor(() => staleSelection, "delayed reveal did not deliver selection");
    await waitFor(
      () => view.selection[0]?.vault?.paths.root.toString() === firstRoot.toString(),
      "delayed reveal replaced the newer vault selection",
    );
    await vscode.commands.executeCommand("stemlink.addFleetingNote");
    const capture = vscode.window.activeTextEditor?.document;
    assert.ok(
      capture && directChild(capture.uri, vscode.Uri.joinPath(firstRoot, "fleeting")),
      "delayed reveal changed the active vault",
    );
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await vscode.workspace.fs.delete(capture.uri);
  } finally {
    releaseReveal();
    view.reveal = originalReveal;
    staleListener.dispose();
  }
  const rows = await provider.getChildren();
  const second = rows?.find((item) => item.vault?.paths.root.toString() === secondRoot.toString());
  assert.ok(second, "second vault row missing");
  let selectionChanged = false;
  const selectionListener = view.onDidChangeSelection((event) => {
    if (event.selection[0]?.vault?.paths.root.toString() === secondRoot.toString())
      selectionChanged = true;
  });
  try {
    await view.reveal(second, { select: true, focus: false });
    await waitFor(() => selectionChanged, "native selection event was not delivered");
  } finally {
    selectionListener.dispose();
  }
  await vscode.commands.executeCommand("stemlink.addFleetingNote");
  const capture = vscode.window.activeTextEditor?.document;
  assert.ok(
    capture && directChild(capture.uri, vscode.Uri.joinPath(secondRoot, "inbox")),
    "native row selection did not change the active vault",
  );
  await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
  await vscode.workspace.fs.delete(capture.uri);

  await vscode.window.showTextDocument(
    vscode.Uri.joinPath(firstRoot, "stable", "202601011200-note-0.md"),
  );
  let refreshes = 0;
  const refreshed = provider.onDidChangeTreeData?.(() => {
    refreshes++;
  });
  try {
    await vscode.commands.executeCommand("stemlink.refresh");
    await waitFor(() => refreshes > 0, "vault tree did not refresh");
  } finally {
    refreshed?.dispose();
  }
  await waitFor(
    () => view.selection[0]?.vault?.paths.root.toString() === secondRoot.toString(),
    "editor change or refresh cleared native vault selection",
  );

  const marker = vscode.Uri.joinPath(secondRoot, ".stemlink.json");
  const bytes = await vscode.workspace.fs.readFile(marker);
  await vscode.workspace.fs.delete(marker);
  await waitFor(
    () => view.selection[0]?.vault?.paths.root.toString() === firstRoot.toString(),
    "removing selected vault did not auto-select the remaining vault",
  );
  await waitFor(() => view.badge?.value === 1, "vault badge did not decrease after removal");
  assert.equal(view.badge?.tooltip, "1 vault");
  const firstMarker = vscode.Uri.joinPath(firstRoot, ".stemlink.json");
  const firstBytes = await vscode.workspace.fs.readFile(firstMarker);
  try {
    await vscode.workspace.fs.delete(firstMarker);
    await waitFor(
      () => view.badge === undefined,
      "vault badge remained after all vaults were removed",
    );
  } finally {
    await vscode.workspace.fs.writeFile(firstMarker, firstBytes);
    await vscode.workspace.fs.writeFile(marker, bytes);
  }
  await waitFor(() => view.badge?.value === 2, "vault badge did not update after rediscovery");
  await waitFor(() => view.title === "Vaults (2)", "restored vault was not rediscovered");
  await waitFor(
    () => view.selection[0]?.vault?.paths.root.toString() === firstRoot.toString(),
    "rediscovered vault was not selected",
  );
  assert.equal(
    view.selection[0]?.vault?.paths.root.toString(),
    firstRoot.toString(),
    "rediscovery replaced the remaining selected vault",
  );
  await vscode.commands.executeCommand("stemlink.selectVault", firstRoot);
  await vscode.commands.executeCommand("workbench.action.closeSidebar");
  await waitFor(() => !view.visible, "Vaults view did not close");
  await vscode.commands.executeCommand("stemlink.selectVault", secondRoot);
  assert.equal(view.visible, false, "changing vault opened the hidden Vaults view");
  await vscode.commands.executeCommand("stemlink.vaults.focus");
  await waitFor(
    () => view.selection[0]?.vault?.paths.root.toString() === secondRoot.toString(),
    "showing Vaults did not restore its selected row",
  );
  await vscode.commands.executeCommand("stemlink.selectVault", firstRoot);
}

async function testRestrictedWorkspace(): Promise<void> {
  assert.equal(vscode.workspace.isTrusted, false, "host did not start in Restricted Mode");
  const extension = vscode.extensions.getExtension("dmundt.stemlink");
  assert.ok(extension);
  const api = vscode.window as {
    createQuickPick: typeof vscode.window.createQuickPick;
    showErrorMessage: typeof vscode.window.showErrorMessage;
  };
  const originalPicker = api.createQuickPick;
  const originalError = api.showErrorMessage;
  const errors: string[] = [];
  let picker: vscode.QuickPick<vscode.QuickPickItem> | undefined;
  api.createQuickPick = new Proxy(originalPicker, {
    apply: (target, receiver, args) => {
      picker = Reflect.apply(target, receiver, args) as vscode.QuickPick<vscode.QuickPickItem>;
      return picker;
    },
  });
  api.showErrorMessage = new Proxy(originalError, {
    apply: (_target, _receiver, args: unknown[]) => {
      errors.push(String(args[0]));
      return Promise.resolve(undefined);
    },
  });
  try {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder);
    const paths = pathsFor(folder);
    const snapshot = async (directory: vscode.Uri): Promise<unknown[]> =>
      Promise.all(
        (await vscode.workspace.fs.readDirectory(directory))
          .sort(([left], [right]) => left.localeCompare(right))
          .map(async ([name, type]) => {
            const uri = vscode.Uri.joinPath(directory, name);
            return [
              name,
              type,
              type & vscode.FileType.Directory
                ? await snapshot(uri)
                : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("hex"),
            ];
          }),
      );
    const before = await snapshot(paths.root);
    await extension.activate();
    assert.ok(extension.isActive, "extension did not activate in Restricted Mode");
    await vscode.commands.executeCommand("stemlink.filterByTags");
    assert.ok(picker, "tag picker did not open");
    assert.ok(picker.items.some((item) => item.label === "test"));
    picker.hide();
    await vscode.commands.executeCommand("stemlink.clearTagFilter");
    await vscode.commands.executeCommand("stemlink.refresh");
    await vscode.commands.executeCommand("stemlink.checkReferences");
    assert.equal(errors.length, 0, "read-only operations attempted trusted work");
    for (const command of [
      "stemlink.addNote",
      "stemlink.addFleetingNote",
      "stemlink.createVault",
      "stemlink.openVault",
    ]) {
      await vscode.commands.executeCommand(command);
    }
    assert.equal(errors.length, 4);
    assert.ok(errors.every((message) => message.includes("Trust the workspace")));
    assert.deepEqual(await snapshot(paths.root), before, "Restricted Mode changed vault files");
  } finally {
    picker?.hide();
    api.createQuickPick = originalPicker;
    api.showErrorMessage = originalError;
  }
}

export async function run(): Promise<void> {
  if (process.env.STEMLINK_RESTRICTED === "1") {
    await testRestrictedWorkspace();
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "test workspace missing");
  const extension = vscode.extensions.getExtension("dmundt.stemlink");
  assert.ok(extension, "development extension missing");
  const windowApi = vscode.window as { createTreeView: typeof vscode.window.createTreeView };
  const originalCreateTreeView = windowApi.createTreeView;
  let vaultView: vscode.TreeView<Item> | undefined;
  let vaultProvider: vscode.TreeDataProvider<Item> | undefined;
  let notesProvider: vscode.TreeDataProvider<Item> | undefined;
  const views = new Map<string, vscode.TreeView<Item>>();
  windowApi.createTreeView = new Proxy(originalCreateTreeView, {
    apply: (target, thisArg, args: unknown[]) => {
      const options = args[1] as vscode.TreeViewOptions<Item>;
      if (options.dragAndDropController) {
        dragControllers.set(String(args[0]), options.dragAndDropController);
        if (args[0] === "stemlink.fleeting") assert.equal(options.canSelectMany, true);
      }

      const view = Reflect.apply(target, thisArg, args) as vscode.TreeView<Item>;
      views.set(String(args[0]), view);
      if (args[0] === "stemlink.vaults") {
        vaultView = view;
        vaultProvider = (args[1] as vscode.TreeViewOptions<Item>).treeDataProvider;
      }
      if (args[0] === "stemlink.notes") notesProvider = options.treeDataProvider;
      return view;
    },
  });
  try {
    await extension.activate();
  } finally {
    windowApi.createTreeView = originalCreateTreeView;
  }
  const settingGroups = extension.packageJSON.contributes.configuration as {
    title: string;
    properties: Record<string, { default: string | boolean; scope: string }>;
  }[];
  assert.deepEqual(
    settingGroups.map((group) => group.title),
    ["Vault Folders", "Display", "Capture", "AI Context"],
    "settings groups or order changed",
  );
  assert.deepEqual(
    Object.keys(settingGroups[0].properties),
    ["stemlink.root", "stemlink.inbox", "stemlink.notes", "stemlink.templates"],
    "vault folder settings are not grouped together",
  );
  const settings = Object.assign({}, ...settingGroups.map((group) => group.properties));
  const contributedViews = extension.packageJSON.contributes.views.stemlink as {
    id: string;
    initialSize?: number;
  }[];
  assert.equal(
    contributedViews.find((view) => view.id === "stemlink.vaults")?.initialSize,
    1,
    "Vaults view should start compact",
  );
  const commands = extension.packageJSON.contributes.commands as {
    command: string;
    title: string;
    icon?: string;
    enablement?: string;
  }[];
  for (const command of ["stemlink.editCaptureMetadata", "stemlink.discardCapture"]) {
    assert.equal(
      commands.find((entry) => entry.command === command)?.enablement,
      "isWorkspaceTrusted && stemlink.hasVault && !listMultiSelection",
      "single-capture enablement lost its trust, vault, or selection guard",
    );
  }
  const welcome = extension.packageJSON.contributes.viewsWelcome as {
    when: string;
    contents: string;
  }[];
  assert.ok(
    welcome
      .find((entry) => entry.contents.includes("command:stemlink.createVault"))
      ?.when.includes("workspaceFolderCount != 0"),
    "empty-window welcome exposes unavailable vault creation",
  );
  const captureCommands = [
    "stemlink.editCaptureMetadata",
    "stemlink.promote",
    "stemlink.discardCapture",
  ];
  const menus = extension.packageJSON.contributes.menus as Record<
    string,
    { command: string; when: string; group?: string }[]
  >;
  const captureMenus = menus["view/item/context"].filter((entry) =>
    captureCommands.includes(entry.command),
  );
  const noteCommands = ["stemlink.editNoteMetadata", "stemlink.deleteNote"];
  const vaultCommands = ["stemlink.newPermanentNote", "stemlink.validateVault"];
  for (const [command, title, when] of [
    ["stemlink.filterByTags", "Filter by tags…", "view == stemlink.notes"],
    [
      "stemlink.clearTagFilter",
      "Clear tag filter",
      "view == stemlink.notes && stemlink.hasTagFilter",
    ],
  ]) {
    const contribution = commands.find((entry) => entry.command === command);
    assert.equal(contribution?.title, title);
    assert.equal(contribution?.icon, undefined);
    assert.deepEqual(
      Object.entries(menus).flatMap(([menu, entries]) =>
        entries.filter((entry) => entry.command === command).map((entry) => [menu, entry.when]),
      ),
      [
        ["view/title", when],
        ["commandPalette", "false"],
      ],
    );
    assert.ok(
      !menus["view/title"]
        .find((entry) => entry.command === command)
        ?.group?.startsWith("navigation"),
    );
    assert.ok(
      !extension.packageJSON.contributes.keybindings?.some(
        (entry: { command: string }) => entry.command === command,
      ),
    );
  }
  assert.deepEqual(
    commands.filter((entry) => vaultCommands.includes(entry.command)).map((entry) => entry.title),
    ["New permanent note", "Validate vault"],
  );
  for (const command of vaultCommands) {
    assert.equal(commands.find((entry) => entry.command === command)?.icon, undefined);
    assert.deepEqual(
      Object.entries(menus).flatMap(([menu, entries]) =>
        entries.filter((entry) => entry.command === command).map((entry) => [menu, entry.when]),
      ),
      [
        ["commandPalette", "false"],
        ["view/item/context", "view == stemlink.vaults && viewItem == stemlink.vault"],
      ],
    );
    assert.ok(
      !extension.packageJSON.contributes.keybindings?.some(
        (entry: { command: string }) => entry.command === command,
      ),
    );
  }
  const noteMenus = menus["view/item/context"].filter((entry) =>
    noteCommands.includes(entry.command),
  );
  assert.deepEqual(
    noteMenus.map((entry) => entry.command),
    noteCommands,
  );
  for (const command of noteCommands) {
    assert.equal(commands.find((entry) => entry.command === command)?.icon, undefined);
    assert.ok(
      menus.commandPalette.some((entry) => entry.command === command && entry.when === "false"),
    );
    assert.ok(
      noteMenus.some(
        (entry) =>
          entry.command === command &&
          entry.when === "view == stemlink.notes && viewItem == stemlink.note" &&
          entry.group !== "inline",
      ),
    );
    assert.ok(!menus["view/title"].some((entry) => entry.command === command));
  }
  assert.notEqual(noteMenus[0].group?.split("@")[0], noteMenus[1].group?.split("@")[0]);
  assert.deepEqual(
    captureMenus.map((entry) => entry.command),
    captureCommands,
  );
  for (const command of captureCommands) {
    assert.equal(commands.find((entry) => entry.command === command)?.icon, undefined);
    assert.ok(
      menus.commandPalette.some((entry) => entry.command === command && entry.when === "false"),
    );
    assert.ok(
      captureMenus.some(
        (entry) =>
          entry.command === command &&
          entry.when === "view == stemlink.fleeting && viewItem == stemlink.capture" &&
          entry.group !== "inline",
      ),
    );
    assert.ok(!menus["view/title"].some((entry) => entry.command === command));
  }
  assert.notEqual(captureMenus[0].group?.split("@")[0], captureMenus[2].group?.split("@")[0]);
  assert.equal(
    commands.find((command) => command.command === "stemlink.createVault")?.title,
    "Create vault",
  );
  const settingsCommand = commands.find((command) => command.command === "stemlink.openSettings");
  assert.equal(settingsCommand?.icon, "$(gear)");
  const titleMenus = extension.packageJSON.contributes.menus["view/title"] as {
    command: string;
    when: string;
    group: string;
  }[];
  assert.ok(
    titleMenus.some(
      (item) =>
        item.command === "stemlink.openSettings" &&
        item.when === "view == stemlink.vaults" &&
        item.group === "settings@1",
    ),
    "settings action is not in the Vaults overflow menu",
  );
  for (const [key, value] of [
    ["stemlink.root", "notes"],
    ["stemlink.inbox", "inbox"],
    ["stemlink.notes", "permanent"],
    ["stemlink.templates", "templates"],
    ["stemlink.enableRouterIndexes", true],
    ["stemlink.offerAgentInstructions", true],
    ["stemlink.showCounts", true],
    ["stemlink.promptForCaptureHeadline", true],
    ["stemlink.promptForPromotionMetadata", false],
    ["stemlink.confirmPromotion", true],
  ] as const) {
    assert.equal(settings[key]?.default, value, `${key} default changed`);
    assert.equal(settings[key]?.scope, "resource", `${key} must remain resource-scoped`);
  }
  if (process.env.STEMLINK_DISCOVERY === "1") {
    assert.ok(vaultView && vaultProvider, "vault view was not captured during activation");
    await testNativeVaultSelection(folder, vaultView, vaultProvider);
    await testDiscovery(folder);
    await testOpenVault(folder);
    await testFeatureSettings(folder);
    await testDynamicVaultFiles(folder, extension.extensionUri);
    return;
  }
  if (process.env.STEMLINK_MULTI_ROOT === "1") {
    assert.ok(vaultProvider && notesProvider);
    await testMultiRoot(views, vaultProvider, notesProvider);
    return;
  }
  const notes = vscode.Uri.joinPath(folder.uri, "notes", "permanent");
  const first = vscode.Uri.joinPath(notes, "202601011200-note-0.md");
  const second = vscode.Uri.joinPath(notes, "202601011200-note-1.md");
  if (process.env.STEMLINK_BENCHMARK !== "1") {
    assert.ok(vaultProvider && notesProvider);
    await testVaultActions(views, vaultProvider);
    await testNoteTagFiltering(views, vaultProvider, notesProvider);
    const commandApi = vscode.commands as { executeCommand: typeof vscode.commands.executeCommand };
    const originalExecuteCommand = commandApi.executeCommand;
    const settingsCalls: unknown[][] = [];
    commandApi.executeCommand = new Proxy(originalExecuteCommand, {
      apply: (target, thisArg, args: unknown[]) => {
        if (args[0] === "workbench.action.openSettings") {
          settingsCalls.push(args);
          return Promise.resolve();
        }
        return Reflect.apply(target, thisArg, args);
      },
    });
    try {
      await originalExecuteCommand("stemlink.openSettings");
      assert.deepEqual(settingsCalls, [["workbench.action.openSettings", "@ext:dmundt.stemlink"]]);
    } finally {
      commandApi.executeCommand = originalExecuteCommand;
    }
    await testVirtualVault();
    await testMockVaultFiles(extension.extensionUri);
    await testRouterMappings(folder);
    const emptyTree = new VaultTree(
      () => undefined,
      () => [],
    );
    try {
      assert.deepEqual(
        (await emptyTree.getChildren()).map((item) => item.label),
        ["Vaults (0)", "Fleeting (0)", "Notes (0)", "References"],
      );
    } finally {
      emptyTree.dispose();
    }
    for (const name of ["", ".", "..", " note", "note ", "note.", "a/b", "a\\b", "a:b", "a?b"]) {
      assert.equal(
        validFolderName(name),
        false,
        `accepted invalid folder name ${JSON.stringify(name)}`,
      );
    }
    assert.equal(validFolderName("notes-2026"), true);
    assert.equal(directChild(first, notes), true);
    assert.equal(directChild(vscode.Uri.joinPath(notes, "nested", "note.md"), notes), false);
    const configApi = vscode.workspace as {
      getConfiguration: typeof vscode.workspace.getConfiguration;
    };
    const originalConfig = configApi.getConfiguration;
    let configuredNames: Record<string, string> = {};
    configApi.getConfiguration = new Proxy(originalConfig, {
      apply: (target, thisArg, args: Parameters<typeof vscode.workspace.getConfiguration>) => {
        if (args[0] !== "stemlink") return Reflect.apply(target, thisArg, args);
        return { get: (key: string, fallback: unknown) => configuredNames[key] ?? fallback };
      },
    });
    try {
      const schemes = [
        { root: "notes", inbox: "inbox", notes: "permanent", templates: "templates" },
        { root: "zk", inbox: "inbox", notes: "notes", templates: "examples" },
        { root: "Stemlink vault", inbox: "Fleeting", notes: "Permanent", templates: "Templates" },
        { root: "vault", inbox: "capture", notes: "notes", templates: "manuals" },
        { root: "vault", inbox: "inbox", notes: "permanent", templates: "examples" },
      ];
      for (const [index, scheme] of schemes.entries()) {
        configuredNames = index === 0 ? {} : scheme;
        const paths = pathsFor(folder);
        const root = vscode.Uri.joinPath(folder.uri, scheme.root);
        assert.equal(
          paths.root.toString(),
          root.toString(),
          "vault root ignored configured/default name",
        );
        assert.equal(paths.inbox.toString(), vscode.Uri.joinPath(root, scheme.inbox).toString());
        assert.equal(paths.notes.toString(), vscode.Uri.joinPath(root, scheme.notes).toString());
        assert.equal(
          paths.templates.toString(),
          vscode.Uri.joinPath(root, scheme.templates).toString(),
        );
      }
    } finally {
      configApi.getConfiguration = originalConfig;
    }
    let badNames: Record<string, string> = { root: "../outside" };
    configApi.getConfiguration = new Proxy(originalConfig, {
      apply: (target, thisArg, args: Parameters<typeof vscode.workspace.getConfiguration>) => {
        const config = Reflect.apply(target, thisArg, args) as vscode.WorkspaceConfiguration;
        if (args[0] !== "stemlink") return config;
        return {
          get: (key: string, fallback: unknown) => badNames[key] ?? config.get(key, fallback),
        };
      },
    });
    try {
      assert.throws(() => pathsFor(folder), /valid folder names/);
      badNames = { inbox: "same", notes: "SAME" };
      assert.throws(() => pathsFor(folder), /distinct valid folder names/);
      for (const templates of ["", "../outside", "INBOX", "PERMANENT"]) {
        badNames = { templates };
        assert.throws(
          () => pathsFor(folder),
          /distinct valid folder names/,
          `accepted invalid or colliding template folder ${JSON.stringify(templates)}`,
        );
      }
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
  const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
    "vscode.executeLinkProvider",
    first,
  );
  const indexingMs = performance.now() - started;
  assert.ok(
    links?.some((link) => link.target?.toString() === second.toString()),
    "document link does not resolve",
  );
  const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeDefinitionProvider",
    first,
    position,
  );
  assert.ok(
    definitions?.some((location) => location.uri.toString() === second.toString()),
    "definition does not resolve",
  );
  if (process.env.STEMLINK_BENCHMARK !== "1") await testMarkdownPreview(first, second);

  const directVault = new Vault(folder);
  const openDocuments = vscode.workspace.textDocuments.length;
  const cpuStart = process.cpuUsage();
  started = performance.now();
  await directVault.ensure();
  assert.ok(
    directVault
      .references("202601011200-note-1")
      .some((ref) => ref.note.uri.toString() === first.toString()),
  );
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
  const references = await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeReferenceProvider",
    first,
    position,
  );
  const referencesMs = performance.now() - started;
  assert.ok(
    references?.some((reference) => reference.uri.toString() === first.toString()),
    "backlink missing",
  );
  if (process.env.STEMLINK_BENCHMARK !== "1") {
    assert.ok(
      references?.some(
        (reference) =>
          reference.uri.toString() === first.toString() &&
          reference.range.start.isEqual(document.positionAt(offset)),
      ),
      "backlink location did not point to the reference",
    );
    const noteReferences = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      first,
      new vscode.Position(0, 0),
    );
    assert.ok(
      noteReferences?.some((reference) => reference.uri.path.endsWith("202601011200-note-2.md")),
      "backlinks to current note missing",
    );
  }

  const edit = new vscode.WorkspaceEdit();
  edit.insert(first, document.positionAt(document.getText().length), "\n[[202601011200-note-");
  assert.equal(await vscode.workspace.applyEdit(edit), true);
  started = performance.now();
  const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider",
    first,
    document.positionAt(document.getText().length),
    "[",
  );
  const completionMs = performance.now() - started;
  const completion = completions?.items.find((item) => item.label === "202601011200-note-1");
  assert.ok(completion, "completion missing");
  assert.ok(typeof completion.insertText === "string");
  assert.ok(completion.range instanceof vscode.Range);
  const completionEdit = new vscode.WorkspaceEdit();
  completionEdit.replace(first, completion.range, completion.insertText);
  assert.equal(await vscode.workspace.applyEdit(completionEdit), true);
  assert.ok(
    document.getText().endsWith("[[202601011200-note-1]]"),
    "completion did not create a valid link",
  );

  const replacement = new vscode.WorkspaceEdit();
  replacement.insert(
    first,
    document.positionAt(document.getText().length),
    "\n[[bad target]]\n[[202601011200-missing]]",
  );
  assert.equal(await vscode.workspace.applyEdit(replacement), true);
  await vscode.commands.executeCommand("stemlink.checkReferences");
  assert.ok(
    vscode.languages
      .getDiagnostics(first)
      .some(
        (diagnostic) =>
          diagnostic.source === "Stemlink" && diagnostic.message === "Malformed reference.",
      ),
    "manual audit did not use unsaved content",
  );

  if (process.env.STEMLINK_BENCHMARK !== "1") {
    const updatedLinks = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      "vscode.executeLinkProvider",
      first,
    );
    assert.ok(
      !updatedLinks?.some((link) => link.target?.path.endsWith("202601011200-missing.md")),
      "missing reference was made navigable",
    );
    const missingPosition = document.positionAt(
      document.getText().lastIndexOf("[[202601011200-missing]]") + 4,
    );
    const missingDefinitions = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeDefinitionProvider",
      first,
      missingPosition,
    );
    assert.ok(
      !missingDefinitions?.some((location) =>
        location.uri.path.endsWith("202601011200-missing.md"),
      ),
      "missing reference resolved to a guessed target",
    );

    const completionInput = new vscode.WorkspaceEdit();
    completionInput.insert(
      first,
      document.positionAt(document.getText().length),
      "\n[[202601011200-no]]",
    );
    assert.equal(await vscode.workspace.applyEdit(completionInput), true);
    const insideClosing = document.positionAt(document.getText().length - 2);
    const closingCompletions = await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      first,
      insideClosing,
      "[",
    );
    const closingCompletion = closingCompletions?.items.find(
      (item) => item.label === "202601011200-note-1",
    );
    assert.equal(
      closingCompletion?.insertText,
      "202601011200-note-1",
      "completion duplicated existing closing brackets",
    );
    assert.ok(
      !closingCompletions?.items.some((item) => item.label === "202601011200-note-0"),
      "completion included the current note",
    );
  }

  const vault = new Vault(folder);
  const tree = new VaultTree(
    () => vault,
    () => [vault],
  );
  const sectionViews = (["Vaults", "Fleeting", "Notes", "References"] as const).map(
    (section) => new VaultTreeSection(tree, section),
  );
  try {
    started = performance.now();
    await vault.ensure();
    const independentIndexMs = performance.now() - started;
    const sections = await tree.getChildren();
    assert.deepEqual(
      sections.map((item) => item.kind),
      ["Vaults", "Fleeting", "Notes", "References"],
    );
    assert.equal(sections[1].tooltip, "Unprocessed captures.");
    assert.equal(sections[1].contextValue, "stemlink.inbox");
    const [vaultRows, captureRows, noteRows, referenceRows] = await Promise.all(
      sectionViews.map((view) => view.getChildren()),
    );
    assert.ok(
      vaultRows.every((item) => item.kind === "vault"),
      "Vaults view contains another section",
    );
    assert.ok(
      captureRows.every((item) => item.kind === "capture"),
      "Fleeting view contains another section",
    );
    assert.ok(
      noteRows.every((item) => item.kind === "note"),
      "Notes view contains another section",
    );
    assert.deepEqual(
      referenceRows.map((item) => item.kind),
      ["Inbound", "Outbound"],
      "References view did not expose Inbound and Outbound sections",
    );
    const referenceSections = await tree.getChildren(sections[3]);
    const outgoing = await tree.getChildren(referenceSections[1]);
    assert.ok(
      outgoing.some((item) => item.label === "202601011200-note-1"),
      "tree outgoing reference missing",
    );
    const missing = outgoing.find((item) => item.label === "202601011200-missing");
    assert.ok(missing?.iconPath instanceof vscode.ThemeIcon && missing.iconPath.id === "warning");
    assert.equal(missing.tooltip, "No note found for 202601011200-missing.");
    const incoming = await tree.getChildren(referenceSections[0]);
    const incomingName =
      process.env.STEMLINK_BENCHMARK === "1"
        ? "202601011200-note-9999.md"
        : "202601011200-note-2.md";
    assert.ok(
      incoming.some((item) => item.label === incomingName),
      "tree incoming reference missing",
    );
    if (process.env.STEMLINK_BENCHMARK !== "1") {
      const config = vscode.workspace.getConfiguration("stemlink", folder.uri);
      const previous = config.inspect<boolean>("showCounts")?.workspaceValue;
      try {
        await config.update("showCounts", false, vscode.ConfigurationTarget.Workspace);
        const hidden = await tree.getChildren();
        assert.deepEqual(
          hidden.map((item) => item.label),
          ["Vaults", "inbox", "permanent", "References"],
        );
        const noVault = new VaultTree(
          () => undefined,
          () => [],
        );
        try {
          assert.deepEqual(
            (await noVault.getChildren()).map((item) => item.label),
            ["Vaults", "Fleeting", "Notes", "References"],
          );
        } finally {
          noVault.dispose();
        }
        const hiddenReferences = await tree.getChildren(hidden[3]);
        assert.deepEqual(
          hiddenReferences.map((item) => item.label),
          ["Inbound", "Outbound"],
        );
        assert.deepEqual(
          (await tree.getChildren(hiddenReferences[0])).map((item) => item.label),
          incoming.map((item) => item.label),
          "hiding counts changed backlinks",
        );
        assert.deepEqual(
          (await tree.getChildren(hiddenReferences[1])).map((item) => item.label),
          outgoing.map((item) => item.label),
          "hiding counts changed outgoing references",
        );
        await waitFor(
          () =>
            [
              ["vaults", "Vaults"],
              ["fleeting", "inbox"],
              ["notes", "permanent"],
              ["references", "References"],
            ].every(([id, name]) => views.get(`stemlink.${id}`)?.title === name),
          "view titles did not hide counts after changing the setting",
        );
      } finally {
        await config.update("showCounts", previous, vscode.ConfigurationTarget.Workspace);
      }
      await waitFor(
        () =>
          [
            ["vaults", "Vaults"],
            ["fleeting", "inbox"],
            ["notes", "permanent"],
            ["references", "References"],
          ].every(([id, name]) => views.get(`stemlink.${id}`)?.title?.startsWith(`${name} (`)),
        "view titles did not restore counts after changing the setting",
      );
      const restored = await tree.getChildren();
      assert.deepEqual(
        (await tree.getChildren(restored[3])).map((item) => item.label),
        referenceSections.map((item) => item.label),
        "reference counts were not restored",
      );

      assert.equal(
        vault.get("202601011200-note-0")?.text,
        document.getText(),
        "index ignored unsaved text",
      );
      const previousText = document.getText();
      const change = new vscode.WorkspaceEdit();
      change.insert(first, document.positionAt(previousText.length), "\n[[202601011200-note-2]]");
      assert.equal(await vscode.workspace.applyEdit(change), true);
      assert.ok(
        vault
          .references("202601011200-note-2")
          .some((ref) => ref.note.uri.toString() === first.toString()),
        "index did not add an unsaved reference",
      );
      await vault.refresh();
      assert.ok(
        vault
          .references("202601011200-note-2")
          .some((ref) => ref.note.uri.toString() === first.toString()),
        "refresh lost an unsaved reference",
      );
      const undo = new vscode.WorkspaceEdit();
      undo.delete(
        first,
        new vscode.Range(
          document.positionAt(previousText.length),
          document.positionAt(document.getText().length),
        ),
      );
      assert.equal(await vscode.workspace.applyEdit(undo), true);
      assert.ok(
        !vault
          .references("202601011200-note-2")
          .some((ref) => ref.note.uri.toString() === first.toString()),
        "index kept a removed unsaved reference",
      );
    }
    started = performance.now();
    const treeNotes = await tree.getChildren(sections[2]);
    const treeMs = performance.now() - started;
    assert.equal(treeNotes.length, process.env.STEMLINK_BENCHMARK === "1" ? 10_000 : 3);
    if (process.env.STEMLINK_BENCHMARK !== "1") {
      assert.deepEqual(
        await tree.getChildren(treeNotes[0]),
        [],
        "leaf note unexpectedly had children",
      );
    }
    started = performance.now();
    tree.refresh();
    await tree.getChildren(sections[2]);
    const treeRefreshMs = performance.now() - started;
    started = performance.now();
    await vscode.commands.executeCommand("stemlink.checkReferences");
    const auditMs = performance.now() - started;
    console.log(
      JSON.stringify({
        scenario:
          process.env.STEMLINK_BENCHMARK === "1"
            ? "10000-note VS Code host"
            : "VS Code integration",
        fixture: "small Markdown notes with YAML title, tag, and one outgoing reference",
        markdownProviderDisabled: process.env.STEMLINK_DISABLE_MARKDOWN_PROVIDER === "1",
        openDocuments,
        platform: `${os.platform()} ${os.release()} ${os.arch()}`,
        cpu: os.cpus()[0]?.model,
        vscode: vscode.version,
        node: process.version,
        firstLinkAndIndexMs: Math.round(indexingMs),
        independentIndexMs: Math.round(independentIndexMs),
        notesTreeMs: Math.round(treeMs),
        notesTreeRefreshMs: Math.round(treeRefreshMs),
        completionMs: Math.round(completionMs),
        directBacklinksMs: Math.round(directBacklinksMs),
        directBacklinksCpuMs: Math.round(directBacklinksCpuMs),
        nativeReferencesMs: Math.round(referencesMs),
        auditMs: Math.round(auditMs),
      }),
    );
  } finally {
    sectionViews.forEach((view) => view.dispose());
    tree.dispose();
    vault.dispose();
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
  }
  if (process.env.STEMLINK_BENCHMARK !== "1") {
    const windowApi = vscode.window as { showInputBox: typeof vscode.window.showInputBox };
    const originalInput = windowApi.showInputBox;
    const answers: (string | undefined)[] = [];
    const defaults: (string | undefined)[] = [];
    const titles: (string | undefined)[] = [];
    windowApi.showInputBox = async (options) => {
      assert.ok(answers.length, "unexpected input prompt");
      if (options?.title === "Capture headline") {
        assert.ok(await options.validateInput?.("   "), "blank headline was accepted");
        assert.equal(await options.validateInput?.("A thought"), undefined);
      }
      defaults.push(options?.value);
      titles.push(options?.title);
      return answers.shift();
    };
    try {
      answers.push("custom-vault", "captures", "permanent");
      const instructionWarningApi = vscode.window as {
        showWarningMessage: typeof vscode.window.showWarningMessage;
      };
      const originalInstructionWarning = instructionWarningApi.showWarningMessage;
      let createInstructionPrompts = 0;
      instructionWarningApi.showWarningMessage = new Proxy(originalInstructionWarning, {
        apply: (_target, _thisArg, args: unknown[]) => {
          if (String(args[0]).includes("AGENTS.md")) {
            createInstructionPrompts++;
            return Promise.resolve("Add");
          }
          return Reflect.apply(originalInstructionWarning, vscode.window, args);
        },
      });
      try {
        await vscode.commands.executeCommand("stemlink.createVault");
      } finally {
        instructionWarningApi.showWarningMessage = originalInstructionWarning;
      }
      assert.deepEqual(defaults, ["notes", "inbox", "permanent"]);
      assert.deepEqual(titles, [
        "Create vault: root folder",
        "Create vault: inbox folder",
        "Create vault: permanent-note folder",
      ]);
      assert.equal(createInstructionPrompts, 1, "Create did not offer optional agent instructions");
      const inbox = vscode.Uri.joinPath(folder.uri, "custom-vault", "captures");
      const permanent = vscode.Uri.joinPath(folder.uri, "custom-vault", "permanent");
      const vaultRoot = vscode.Uri.joinPath(folder.uri, "custom-vault");
      const templateDirectory = vscode.Uri.joinPath(vaultRoot, "templates");
      const rootIndex = vscode.Uri.joinPath(folder.uri, "custom-vault", routerIndexName);
      const inboxIndex = vscode.Uri.joinPath(inbox, routerIndexName);
      const notesIndex = vscode.Uri.joinPath(permanent, routerIndexName);
      const manual = vscode.Uri.joinPath(folder.uri, "custom-vault", "README.md");
      const marker = vscode.Uri.joinPath(folder.uri, "custom-vault", ".stemlink.json");
      assert.deepEqual(
        JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(marker)).toString("utf8")),
        { version: 1, inbox: "captures", notes: "permanent", templates: "templates" },
        "vault marker was not created",
      );
      assert.ok((await vscode.workspace.fs.stat(inbox)).type & vscode.FileType.Directory);
      assert.ok((await vscode.workspace.fs.stat(permanent)).type & vscode.FileType.Directory);
      assert.ok(
        (await vscode.workspace.fs.stat(templateDirectory)).type & vscode.FileType.Directory,
      );
      for (const [directory, template] of [
        [vaultRoot, "vault.md"],
        [inbox, "inbox.md"],
        [permanent, "notes.md"],
      ] as const) {
        const source = vscode.Uri.joinPath(
          extension.extensionUri,
          "templates",
          "agent-instructions",
          template,
        );
        const expectedInstructions = Buffer.from(await vscode.workspace.fs.readFile(source))
          .toString("utf8")
          .replaceAll("{{vaultRoot}}", "`custom-vault/`")
          .replaceAll("{{inbox}}", "`captures/`")
          .replaceAll("{{notes}}", "`permanent/`")
          .replaceAll("{{templates}}", "`templates/`");
        assert.deepEqual(
          await vscode.workspace.fs.readFile(vscode.Uri.joinPath(directory, "AGENTS.md")),
          Buffer.from(expectedInstructions),
          `${template} instructions were not personalized and installed`,
        );
      }
      const manualTemplate = Buffer.from(
        await vscode.workspace.fs.readFile(
          vscode.Uri.joinPath(extension.extensionUri, "templates", "README.md"),
        ),
      ).toString("utf8");
      assert.deepEqual(
        await vscode.workspace.fs.readFile(manual),
        Buffer.from(renderVaultReadme(manualTemplate, "custom-vault", "captures", "permanent")),
        "vault manual does not include its configured folder names",
      );
      const templateNames = ["_template.md", "_fleeting.md", "_promotion.md"];
      for (const name of templateNames) {
        assert.deepEqual(
          await vscode.workspace.fs.readFile(vscode.Uri.joinPath(templateDirectory, name)),
          await vscode.workspace.fs.readFile(
            vscode.Uri.joinPath(extension.extensionUri, "templates", name),
          ),
          `${name} does not match the template`,
        );
      }
      const rootIndexText = Buffer.from(await vscode.workspace.fs.readFile(rootIndex)).toString(
        "utf8",
      );
      assert.match(
        rootIndexText,
        /Inbox `captures\/` \(0 captures\)[\s\S]*Notes `permanent\/` \(0 Markdown files\)/,
        "vault router did not report configured folders and initial counts",
      );
      assert.match(
        Buffer.from(await vscode.workspace.fs.readFile(inboxIndex)).toString("utf8"),
        /Markdown captures: 0/,
      );
      assert.match(
        Buffer.from(await vscode.workspace.fs.readFile(notesIndex)).toString("utf8"),
        /Markdown files: 0 \(excludes INDEX\.md and AGENTS\.md\)/,
      );
      assert.equal(
        vscode.workspace.getConfiguration("stemlink", folder.uri).get("root"),
        "custom-vault",
      );

      await vscode.workspace.fs.writeFile(manual, Buffer.from("Existing manual\n"));
      const notesDocument = await vscode.workspace.openTextDocument(notesIndex);
      const userText = "User-authored router guidance.\n\n";
      const routerEdit = new vscode.WorkspaceEdit();
      routerEdit.insert(notesIndex, new vscode.Position(0, 0), userText);
      assert.equal(await vscode.workspace.applyEdit(routerEdit), true);
      assert.ok(notesDocument.isDirty);
      const noteTemplate = vscode.Uri.joinPath(permanent, "_template.md");
      await vscode.workspace.fs.writeFile(noteTemplate, Buffer.from("Existing template\n"));
      const reuseWarningApi = vscode.window as {
        showWarningMessage: typeof vscode.window.showWarningMessage;
      };
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
      assert.equal(
        Buffer.from(await vscode.workspace.fs.readFile(manual)).toString("utf8"),
        "Existing manual\n",
        "reusing a vault overwrote its manual",
      );
      assert.equal(
        Buffer.from(await vscode.workspace.fs.readFile(noteTemplate)).toString("utf8"),
        "Existing template\n",
        "reusing a vault overwrote its template",
      );
      assert.ok(
        reuseWarnings.some(
          (message) =>
            message.includes("README.md") && templateNames.every((name) => message.includes(name)),
        ),
        "preserved files were not reported",
      );

      const validationApi = vscode.window as {
        showErrorMessage: typeof vscode.window.showErrorMessage;
      };
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
        assert.ok(
          validationErrors.some((message) =>
            message.includes("Inbox and notes must be different folders"),
          ),
          "duplicate folder names were accepted",
        );
        await assert.rejects(async () =>
          vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, "invalid-vault")),
        );
        answers.push("reserved-vault", "captures", "templates");
        await vscode.commands.executeCommand("stemlink.createVault");
        assert.ok(
          validationErrors.some((message) => message.includes("templates folder must be distinct")),
          "templates destination was allowed to collide with the configured notes folder",
        );
        await assert.rejects(async () =>
          vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, "reserved-vault")),
        );
        answers.push(undefined);
        await vscode.commands.executeCommand("stemlink.createVault");
        answers.push("cancelled-vault", undefined);
        await vscode.commands.executeCommand("stemlink.createVault");
        answers.push("cancelled-vault", "captures", undefined);
        await vscode.commands.executeCommand("stemlink.createVault");
        await assert.rejects(async () =>
          vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, "cancelled-vault")),
        );
        assert.equal(
          vscode.workspace.getConfiguration("stemlink", folder.uri).get("root"),
          "custom-vault",
          "cancelled creation changed settings",
        );
        await vscode.commands.executeCommand("stemlink.promote", { uri: manual });
        assert.ok(
          validationErrors.some((message) => message.includes("Select an inbox Markdown capture")),
          "promotion accepted a file outside the inbox",
        );

        const warningApi = vscode.window as {
          showWarningMessage: typeof vscode.window.showWarningMessage;
        };
        const previousWarning = warningApi.showWarningMessage;
        warningApi.showWarningMessage = new Proxy(previousWarning, {
          apply: (_target, _thisArg, args: unknown[]) =>
            Promise.resolve(args[2] === "Continue" ? "Continue" : undefined),
        });
        try {
          answers.push("custom-vault", "different", "permanent");
          await vscode.commands.executeCommand("stemlink.createVault");
          assert.ok(
            validationErrors.some((message) =>
              message.includes(".stemlink.json specifies different folders"),
            ),
            "conflicting marker was not reported",
          );
          assert.deepEqual(
            JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(marker)).toString("utf8")),
            { version: 1, inbox: "captures", notes: "permanent", templates: "templates" },
            "reuse overwrote the marker",
          );
          await assert.rejects(async () =>
            vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, "custom-vault", "different")),
          );
        } finally {
          warningApi.showWarningMessage = previousWarning;
        }
        warningApi.showWarningMessage = new Proxy(previousWarning, {
          apply: () => Promise.resolve(undefined),
        });
        try {
          answers.push("custom-vault", "captures", "permanent");
          await vscode.commands.executeCommand("stemlink.createVault");
          assert.equal(
            Buffer.from(await vscode.workspace.fs.readFile(manual)).toString("utf8"),
            "Existing manual\n",
            "declining reuse changed the manual",
          );
        } finally {
          warningApi.showWarningMessage = previousWarning;
        }

        const workspaceApi = vscode.workspace as {
          getConfiguration: typeof vscode.workspace.getConfiguration;
        };
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
              update: async (
                key: string,
                value: unknown,
                target?: vscode.ConfigurationTarget | boolean,
              ) => {
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
          apply: (_target, _thisArg, args: unknown[]) =>
            Promise.resolve(args[2] === "Continue" ? "Continue" : undefined),
        });
        try {
          answers.push("rollback-vault", "captures", "permanent");
          await vscode.commands.executeCommand("stemlink.createVault");
          assert.ok(
            validationErrors.some((message) => message.includes("Injected settings failure")),
            `settings failure was not reported: ${validationErrors.join("; ")}`,
          );
          const restored = originalConfig("stemlink", folder.uri);
          assert.equal(
            restored.get("root"),
            "custom-vault",
            "failed creation did not restore root setting",
          );
          assert.equal(
            restored.get("inbox"),
            "captures",
            "failed creation did not restore inbox setting",
          );
          assert.equal(
            restored.get("notes"),
            "permanent",
            "failed creation did not restore notes setting",
          );
          injectFailure = true;
          injectRollbackFailure = true;
          answers.push("rollback-vault-2", "captures", "permanent");
          await vscode.commands.executeCommand("stemlink.createVault");
          assert.ok(
            validationErrors.some(
              (message) =>
                message.includes("Settings rollback also failed") &&
                message.includes("Injected rollback failure"),
            ),
            "rollback failure was not reported",
          );
        } finally {
          workspaceApi.getConfiguration = originalConfig;
          warningApi.showWarningMessage = previousReuseWarning;
          await originalConfig("stemlink", folder.uri).update(
            "root",
            "custom-vault",
            vscode.ConfigurationTarget.Workspace,
          );
        }
      } finally {
        validationApi.showErrorMessage = originalValidationError;
      }

      await testCommandFailures(vaultRoot, inbox, permanent, answers);

      answers.push("A: title", "alpha, beta");
      await vscode.commands.executeCommand("stemlink.addNote");
      const created = (await vscode.workspace.fs.readDirectory(permanent)).filter(
        ([name]) => !name.startsWith("_") && !isVaultInstructionFile(name),
      );
      assert.equal(created.length, 1, "New permanent note did not create a file");
      const firstText = Buffer.from(
        await vscode.workspace.fs.readFile(vscode.Uri.joinPath(permanent, created[0][0])),
      ).toString("utf8");
      assert.match(firstText, /A: title/);
      assert.match(firstText, /^tags: \[alpha, beta\]\r?$/m);

      const createdUri = vscode.Uri.joinPath(permanent, created[0][0]);
      await waitFor(
        () =>
          notesDocument.getText().includes("Markdown files: 2 (excludes INDEX.md and AGENTS.md)"),
        "notes router did not update after New permanent note",
      );
      assert.ok(
        notesDocument.getText().startsWith(userText),
        "updating a dirty router discarded user text",
      );
      assert.ok(notesDocument.isDirty, "updating a dirty router saved user edits implicitly");
      assert.equal(await notesDocument.save(), true);
      await waitForFileText(
        notesIndex,
        (text) => text.includes("Markdown files: 2 (excludes INDEX.md and AGENTS.md)"),
        "updated notes router was not saved by the user",
      );
      await waitForFileText(
        rootIndex,
        (text) => text.includes("Notes `permanent/` (2 Markdown files)"),
        "vault router did not update after New permanent note",
      );
      answers.push("A: title", "other");
      await vscode.commands.executeCommand("stemlink.addNote");
      const afterCollision = (await vscode.workspace.fs.readDirectory(permanent)).filter(
        ([name]) => !name.startsWith("_") && !isVaultInstructionFile(name),
      );
      assert.equal(afterCollision.length, 2, "second note overwrote the first");
      const secondCreated = afterCollision.find(([name]) => name !== created[0][0]);
      assert.ok(secondCreated);
      assert.equal(
        Buffer.from(await vscode.workspace.fs.readFile(createdUri)).toString("utf8"),
        firstText,
      );
      await vscode.workspace.fs.delete(vscode.Uri.joinPath(permanent, secondCreated[0]));
      await vscode.workspace.fs.writeFile(
        noteTemplate,
        Buffer.from(`[[${created[0][0].slice(0, -3)}]]\n[[bad target]]\n`),
      );
      const invalid = vscode.Uri.joinPath(permanent, "invalid.md");
      await vscode.workspace.fs.writeFile(invalid, Buffer.from("Invalid note\n"));
      await vscode.commands.executeCommand("stemlink.checkReferences");
      assert.ok(
        !vscode.languages
          .getDiagnostics(noteTemplate)
          .some((diagnostic) => diagnostic.source === "Stemlink"),
        "audit reported a template",
      );
      assert.ok(
        vscode.languages
          .getDiagnostics(invalid)
          .some((diagnostic) => diagnostic.message === "Invalid note filename."),
        "audit ignored an invalid non-template filename",
      );
      assert.ok(
        vscode.languages
          .getDiagnostics(createdUri)
          .some((diagnostic) => diagnostic.message === "No incoming references."),
        "template link counted as an audited incoming reference",
      );
      const templateVault = new Vault(folder);
      try {
        await templateVault.ensure();
        assert.ok(
          !templateVault
            .references(created[0][0].slice(0, -3))
            .some((ref) => ref.note.name.startsWith("_")),
          "underscore-prefixed file appeared in backlinks",
        );
        assert.ok(
          !templateVault.allTargets.some((target) => target.name.startsWith("_")),
          "underscore-prefixed file appeared as a reference target",
        );
        const templateTree = new VaultTree(
          () => templateVault,
          () => [templateVault],
        );
        const hiddenCapture = vscode.Uri.joinPath(inbox, "_hidden.md");
        try {
          await vscode.workspace.fs.writeFile(hiddenCapture, Buffer.from("Hidden capture\n"));
          const sections = await templateTree.getChildren();
          for (const kind of ["Fleeting", "Notes"]) {
            const section = sections.find((item) => item.kind === kind);
            assert.ok(section);
            const children = await templateTree.getChildren(section);
            assert.ok(
              !children.some((item) => String(item.label).startsWith("_")),
              `${kind} view included an underscore-prefixed file`,
            );
          }
          const templateDocument = await vscode.workspace.openTextDocument(noteTemplate);
          await templateVault.recordFile(noteTemplate);
          const edit = new vscode.WorkspaceEdit();
          edit.insert(templateDocument.uri, new vscode.Position(0, 0), "Edited template\n");
          assert.equal(await vscode.workspace.applyEdit(edit), true);
          assert.ok(!templateVault.target("_template"));
          assert.ok(!templateVault.get("_template"));
          await templateDocument.save();
        } finally {
          templateTree.dispose();
          await vscode.workspace.fs.delete(hiddenCapture);
        }
      } finally {
        templateVault.dispose();
      }
      await vscode.workspace.fs.delete(invalid);

      const liveVault = new Vault(folder);
      const liveTree = new VaultTree(
        () => liveVault,
        () => [liveVault],
      );
      try {
        await Promise.all([liveVault.ensure(), liveVault.ensure()]);
        assert.ok(
          !liveVault.allTargets.some((target) => isVaultInstructionFile(target.name)),
          "router or agent instructions appeared as a note target",
        );
        const targetStem = created[0][0].slice(0, -3);
        const liveStem = "202601021200-live-index";
        const liveUri = vscode.Uri.joinPath(permanent, `${liveStem}.md`);
        await vscode.workspace.fs.writeFile(
          liveUri,
          Buffer.from(`---\ntitle: Live\ntags: []\n---\n\n[[${targetStem}]] [[${targetStem}]]\n`),
        );
        await waitFor(
          () =>
            liveVault.references(targetStem).filter((ref) => ref.note.stem === liveStem).length ===
            2,
          "index did not discover a new file and both references",
        );
        assert.ok(liveVault.target(liveStem), "filename index missed a created note");
        await waitForFileText(
          notesIndex,
          (text) => text.includes("Markdown files: 3 (excludes INDEX.md and AGENTS.md)"),
          "notes router did not update its count after an external note was added",
        );
        await waitForFileText(
          rootIndex,
          (text) => text.includes("Notes `permanent/` (3 Markdown files)"),
          "vault router did not update its count after an external note was added",
        );
        await vscode.workspace.fs.writeFile(
          liveUri,
          Buffer.from("---\ntitle: Changed\ntags: []\n---\n\nNo links\n"),
        );
        await waitFor(
          () =>
            liveVault.get(liveStem)?.text.includes("No links") === true &&
            !liveVault.references(targetStem).some((ref) => ref.note.stem === liveStem),
          "index kept stale references after a file edit",
        );
        await vscode.workspace.fs.delete(liveUri);
        await waitFor(
          () => !liveVault.target(liveStem) && !liveVault.get(liveStem),
          "index kept a deleted file",
        );
        await waitForFileText(
          rootIndex,
          (text) => text.includes("Notes `permanent/` (2 Markdown files)"),
          "vault router did not update its count after a note was deleted",
        );

        const sections = await liveTree.getChildren();
        const captures = await liveTree.getChildren(sections[1]);
        assert.deepEqual(captures, [], "empty inbox contains captures");
        assert.equal(liveTree.getTreeItem(sections[1]), sections[1]);
        await vscode.commands.executeCommand("stemlink.refresh");
      } finally {
        liveTree.dispose();
        liveVault.dispose();
      }

      const fleetingTemplate = vscode.Uri.joinPath(templateDirectory, "_fleeting.md");
      const fleetingText = "Custom capture prompt\n";
      await vscode.workspace.fs.writeFile(fleetingTemplate, Buffer.from(fleetingText));
      await vscode.commands.executeCommand("stemlink.addFleetingNote");
      const firstCapture = vscode.window.activeTextEditor?.document.uri;
      assert.ok(firstCapture, "fleeting note was not opened");
      assert.equal(
        firstCapture
          .with({ path: firstCapture.path.slice(0, firstCapture.path.lastIndexOf("/")) })
          .toString(),
        inbox.toString(),
        "fleeting note was not opened in the inbox",
      );
      assert.match(firstCapture.path, /\/\d{12}-capture(?:-\d+)?\.md$/);
      assert.equal(
        Buffer.from(await vscode.workspace.fs.readFile(firstCapture))
          .toString("utf8")
          .replace(/\r\n/g, "\n"),
        fleetingText,
      );
      await vscode.commands.executeCommand("stemlink.addFleetingNote");
      const secondCapture = vscode.window.activeTextEditor?.document.uri;
      assert.ok(
        secondCapture && secondCapture.toString() !== firstCapture.toString(),
        "fleeting note overwrote an existing capture",
      );
      assert.equal(
        Buffer.from(await vscode.workspace.fs.readFile(firstCapture))
          .toString("utf8")
          .replace(/\r\n/g, "\n"),
        fleetingText,
      );
      assert.equal(
        Buffer.from(await vscode.workspace.fs.readFile(secondCapture))
          .toString("utf8")
          .replace(/\r\n/g, "\n"),
        fleetingText,
      );
      await waitForFileText(
        inboxIndex,
        (text) => text.includes("Markdown captures: 2"),
        "inbox router did not update its count after captures were created",
      );
      const captureVault = new Vault(folder);
      const captureTree = new VaultTree(
        () => captureVault,
        () => [captureVault],
      );
      try {
        const sections = await captureTree.getChildren();
        const captures = await captureTree.getChildren(sections[1]);
        assert.equal(captures.length, 2, "inbox tree omitted captures");
        assert.ok(
          captures.every((item) => item.label !== routerIndexName),
          "router index appeared as a capture",
        );
        assert.ok(
          captures.every(
            (item) =>
              item.contextValue === "stemlink.capture" &&
              item.command?.command === "stemlink.openAt",
          ),
        );
      } finally {
        captureTree.dispose();
        captureVault.dispose();
      }
      await vscode.commands.executeCommand("stemlink.openAt", firstCapture, 7);
      assert.equal(
        vscode.window.activeTextEditor?.selection.active.character,
        7,
        "openAt did not select the requested position",
      );

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
        assert.ok(
          errors.some(
            (message) =>
              message.includes("Fleeting template not found") && message.includes("_fleeting.md"),
          ),
          "missing fleeting template was not reported",
        );
        assert.equal(
          (await vscode.workspace.fs.readDirectory(inbox)).filter(
            ([name]) => !isVaultInstructionFile(name),
          ).length,
          2,
          "missing template created a capture",
        );
        await vscode.workspace.fs.createDirectory(fleetingTemplate);
        const previousErrors = errors.length;
        try {
          await vscode.commands.executeCommand("stemlink.addFleetingNote");
          assert.ok(
            errors.length > previousErrors,
            "unreadable fleeting template was not reported",
          );
          assert.ok(
            !errors[errors.length - 1].includes("Fleeting template not found"),
            "non-missing template error was misreported",
          );
          assert.equal(
            (await vscode.workspace.fs.readDirectory(inbox)).filter(
              ([name]) => !isVaultInstructionFile(name),
            ).length,
            2,
            "unreadable template created a capture",
          );
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
      await vscode.commands.executeCommand("stemlink.promote", { uri: capture });
      const after = (await vscode.workspace.fs.readDirectory(permanent)).filter(
        ([name]) => !name.startsWith("_") && !isVaultInstructionFile(name),
      );
      assert.equal(after.length, 2, "promotion did not create a file");
      const promoted = after.find(([name]) => name.includes("promoted-title"));
      assert.ok(promoted);
      const promotedText = Buffer.from(
        await vscode.workspace.fs.readFile(vscode.Uri.joinPath(permanent, promoted[0])),
      ).toString("utf8");
      assert.match(promotedText, /Capture body/);
      assert.match(promotedText, /^tags: \[ideas\]\r?$/m);
      await assert.rejects(async () => vscode.workspace.fs.stat(capture));
      await waitForFileText(
        inboxIndex,
        (text) => text.includes("Markdown captures: 2"),
        "inbox router did not update after promotion",
      );

      const changing = vscode.Uri.joinPath(inbox, "changing.md");
      await vscode.workspace.fs.writeFile(changing, Buffer.from("Original capture\n"));
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(changing));
      const onSave = vscode.workspace.onWillSaveTextDocument((event) => {
        if (event.document.uri.path.includes("changing-capture.md")) {
          event.waitUntil(
            vscode.workspace.fs
              .writeFile(changing, Buffer.from("Changed capture\n"))
              .then(() => []),
          );
        }
      });
      try {
        answers.push("Changing capture", "");
        await vscode.commands.executeCommand("stemlink.promote", { uri: changing });
      } finally {
        onSave.dispose();
      }
      assert.equal(
        Buffer.from(await vscode.workspace.fs.readFile(changing)).toString("utf8"),
        "Changed capture\n",
        "promotion removed a concurrently changed capture",
      );

      answers.push(undefined);
      await vscode.commands.executeCommand("stemlink.addNote");
      assert.equal(
        (await vscode.workspace.fs.readDirectory(permanent)).filter(
          ([name]) => !name.startsWith("_") && !isVaultInstructionFile(name),
        ).length,
        3,
        "cancelled note was created",
      );
      assert.equal(answers.length, 0);

      const warningApi = vscode.window as {
        showWarningMessage: typeof vscode.window.showWarningMessage;
      };
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
        rename.renameFile(
          vscode.Uri.joinPath(permanent, created[0][0]),
          vscode.Uri.joinPath(permanent, "renamed.md"),
        );
        assert.equal(await vscode.workspace.applyEdit(rename), true);
        assert.ok(
          warnings.some((message) => message.includes("renamed")),
          "rename warning missing",
        );
      } finally {
        warningApi.showWarningMessage = originalWarning;
      }
      const captureConfig = vscode.workspace.getConfiguration("stemlink", vaultRoot);
      const previousHeadline = captureConfig.inspect<boolean>(
        "promptForCaptureHeadline",
      )?.workspaceFolderValue;
      try {
        await captureConfig.update(
          "promptForCaptureHeadline",
          true,
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
        const beforeCancel = await vscode.workspace.fs.readDirectory(inbox);
        answers.push(undefined);
        await vscode.commands.executeCommand("stemlink.addFleetingNote");
        assert.deepEqual(
          await vscode.workspace.fs.readDirectory(inbox),
          beforeCancel,
          "cancelled headline created a capture",
        );
        const headline = "Café ideas for a useful and deliberately long capture headline ".repeat(
          3,
        );
        const filenames = new Set<string>();
        for (let attempt = 0; attempt < 2; attempt++) {
          answers.push(`  ${headline}  `);
          await vscode.commands.executeCommand("stemlink.addFleetingNote");
          const uri: vscode.Uri | undefined = vscode.window.activeTextEditor?.document.uri;
          assert.ok(uri);
          const name = uri.path.slice(uri.path.lastIndexOf("/") + 1);
          assert.match(
            name,
            /^\d{12}-cafe-ideas-for-a-useful-and-deliberately-long-[a-z]+(?:-2)?\.md$/,
          );
          const shortSlug = name.slice(13, -3).replace(/-2$/, "");
          assert.ok(shortSlug.length <= 48, "headline filename slug was not shortened");
          assert.ok(!shortSlug.endsWith("-"), "headline slug ends with a hyphen");
          filenames.add(name);
          const text: string = Buffer.from(await vscode.workspace.fs.readFile(uri))
            .toString("utf8")
            .replace(/\r\n/g, "\n");
          assert.equal(text, `# ${headline.trim()}\n\n${fleetingText}`);
        }
        assert.equal(filenames.size, 2, "repeated headline overwrote an existing capture");
        assert.equal(titles.at(-1), "Capture headline");
        assert.equal(answers.length, 0);
      } finally {
        await captureConfig.update(
          "promptForCaptureHeadline",
          previousHeadline,
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
      }
      await testCaptureActions(vaultRoot, inbox, permanent);
      await testPermanentNoteActions(folder, permanent);
      await testDragPromotion(inbox, permanent);
    } finally {
      windowApi.showInputBox = originalInput;
    }
  }
}
