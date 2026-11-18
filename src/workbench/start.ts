import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { VaultAgentInstructions } from './agentInstructions';
import {
  auditNotes,
  captureMetadata,
  isExcludedNoteFile,
  isReservedFolderName,
  linksIn,
  makeCapture,
  makeNote,
  promoteNote,
  renderVaultReadme,
  slug,
  timestamp,
} from '../core/documents';
import { readVaultMarker, resolveVaultPaths, samePaths } from './discovery';
import { VaultRouterIndexes } from './router';
import { extendMarkdownPreview, MarkdownParser } from './preview';
import { NoteLinksTool, noteLinksToolName } from './noteLinksTool';
import { Item, VaultSection, VaultTree, VaultTreeSection } from './tree';
import {
  Vault,
  VaultPaths,
  directChild,
  reportError,
  sameUri,
  textPosition,
  validFolderName,
} from '../platform/vault';

export async function activate(
  context: vscode.ExtensionContext,
): Promise<{ extendMarkdownIt(markdown: MarkdownParser): MarkdownParser }> {
  const vaults = new Map<string, Vault>();
  const diagnostics = vscode.languages.createDiagnosticCollection('Stemlink');
  const background = new Map<Vault, Promise<void>>();
  const selectionKey = 'stemlink.selectedVault';
  const pendingOpenKey = 'stemlink.pendingOpenVault';
  let selectedVault: Vault | undefined;
  let configuring = false;
  context.subscriptions.push(diagnostics);
  context.subscriptions.push(
    new vscode.Disposable(() => {
      vaults.forEach((vault) => vault.dispose());
      vaults.clear();
    }),
  );

  const allVaults = () => [...vaults.values()];
  const activeVault = () => selectedVault;
  const requireActiveVault = (): Vault => {
    if (selectedVault) return selectedVault;
    if (!vscode.workspace.workspaceFolders?.length)
      throw new Error('Open a workspace folder first.');
    throw new Error('Select a vault under Vaults first.');
  };
  const vaultFor = (uri?: vscode.Uri): Vault | undefined => {
    if (!uri) return selectedVault;
    const matches = allVaults()
      .filter((vault) => {
        const root = vault.paths.root;
        return (
          root.scheme === uri.scheme &&
          root.authority === uri.authority &&
          (sameUri(root, uri) ||
            uri.toString().startsWith(`${root.toString().replace(/\/$/, '')}/`))
        );
      })
      .sort((a, b) => b.paths.root.path.length - a.paths.root.path.length);
    if (matches.length) return matches[0];
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    return selectedVault && folder && sameUri(folder.uri, selectedVault.folder.uri)
      ? selectedVault
      : undefined;
  };
  const previewVaults = new WeakSet<Vault>();
  const previewNames = new WeakSet<Vault>();
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let previewDisposed = false;
  const refreshPreview = () => {
    if (previewDisposed) return;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = undefined;
      void vscode.commands.executeCommand('markdown.preview.refresh').then(undefined, reportError);
    }, 100);
  };
  context.subscriptions.push(
    new vscode.Disposable(() => {
      previewDisposed = true;
      if (previewTimer) clearTimeout(previewTimer);
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(refreshPreview),
  );
  const previewTarget = (stem: string, environment: unknown): string | undefined => {
    const source =
      environment && typeof environment === 'object' && 'currentDocument' in environment
        ? environment.currentDocument
        : undefined;
    if (!(source instanceof vscode.Uri)) return undefined;
    const vault = vaultFor(source);
    if (!vault) return undefined;
    if (!previewVaults.has(vault)) {
      previewVaults.add(vault);
      context.subscriptions.push(vault.changed.event(refreshPreview));
    }
    if (!vault.namesReady) {
      if (!previewNames.has(vault)) {
        previewNames.add(vault);
        void vault.ensureNames().then(
          () => {
            previewNames.delete(vault);
            refreshPreview();
          },
          (error: unknown) => {
            previewNames.delete(vault);
            reportError(error);
          },
        );
      }
      return undefined;
    }
    const target = vault.target(stem)?.uri;
    if (!target || target.scheme !== source.scheme || target.authority !== source.authority)
      return undefined;
    const relative =
      source.scheme === 'file'
        ? path.relative(path.dirname(source.fsPath), target.fsPath).split(path.sep).join('/')
        : path.posix.relative(path.posix.dirname(source.path), target.path);
    return `./${relative.split('/').map(encodeURIComponent).join('/')}`;
  };
  const tree = new VaultTree(
    activeVault,
    allVaults,
    vscode.languages.createDiagnosticCollection('Stemlink tags'),
  );
  const routerIndexes = new VaultRouterIndexes();
  const agentInstructions = new VaultAgentInstructions(context.extensionUri);
  const routerIndexesEnabled = (paths: VaultPaths): boolean =>
    vscode.workspace
      .getConfiguration('stemlink', paths.root)
      .get<boolean>('enableRouterIndexes', true);
  const agentInstructionsEnabled = (paths: VaultPaths): boolean =>
    vscode.workspace
      .getConfiguration('stemlink', paths.root)
      .get<boolean>('offerAgentInstructions', true);
  const syncRouterIndexes = () =>
    routerIndexes.sync(
      allVaults()
        .filter((vault) => routerIndexesEnabled(vault.paths))
        .map((vault) => vault.paths),
    );
  let discoveryFailed = false;
  context.subscriptions.push(tree);
  context.subscriptions.push(routerIndexes);
  const treeSections: VaultSection[] = ['Vaults', 'Fleeting', 'Notes', 'References'];
  const treeViews = new Map<VaultSection, vscode.TreeView<Item>>();
  interface TagPickItem extends vscode.QuickPickItem {
    tag: string;
  }
  let tagPickerScope:
    { picker: vscode.QuickPick<TagPickItem>; vault: Vault; notesPath: string } | undefined;
  let hasTagFilter: boolean | undefined;
  const updateTagFilterView = () => {
    const tags = selectedVault ? tree.tagFilter(selectedVault) : [];
    const label = selectedVault ? tree.vaultLabel(selectedVault) : undefined;
    for (const section of ['Fleeting', 'Notes', 'References'] as const) {
      const view = treeViews.get(section);
      if (view)
        view.description =
          section === 'Notes' && tags.length ? `${label} · Tags: ${tags.join(', ')}` : label;
    }
    if (hasTagFilter !== Boolean(tags.length)) {
      hasTagFilter = Boolean(tags.length);
      void vscode.commands
        .executeCommand('setContext', 'stemlink.hasTagFilter', hasTagFilter)
        .then(undefined, reportError);
    }
    const scope = tagPickerScope;
    if (
      scope &&
      (scope.vault !== selectedVault ||
        !allVaults().includes(scope.vault) ||
        scope.notesPath !== scope.vault.paths.notes.toString())
    )
      scope.picker.hide();
  };
  context.subscriptions.push(
    new vscode.Disposable(() => {
      tagPickerScope?.picker.dispose();
    }),
  );
  const captureMime = 'application/vnd.stemlink.captures';
  let draggedCaptures: { id: string; items: Item[] } | undefined;
  let dropping = false;
  const dragController: vscode.TreeDragAndDropController<Item> = {
    dragMimeTypes: [captureMime],
    dropMimeTypes: [],
    handleDrag: (items, transfer, token) => {
      draggedCaptures = undefined;
      if (token.isCancellationRequested || !vscode.workspace.isTrusted) return;
      const captures = items.filter((item) => item.kind === 'capture' && item.uri);
      if (!captures.length) return;
      draggedCaptures = { id: randomUUID(), items: captures };
      transfer.set(captureMime, new vscode.DataTransferItem(draggedCaptures.id));
    },
  };
  const dropController: vscode.TreeDragAndDropController<Item> = {
    dragMimeTypes: [],
    dropMimeTypes: [captureMime],
    handleDrop: async (target, transfer, token) => {
      const drag = draggedCaptures;
      if (!drag || (target && target.kind !== 'note')) return;
      try {
        let matches = false;
        // Native drops can contain a blank browser entry before the extension's entry.
        for (const [mime, payload] of transfer) {
          if (mime !== captureMime) continue;
          const id = await payload.asString();
          if (draggedCaptures !== drag) return;
          if (id === drag.id) {
            matches = true;
            break;
          }
        }
        if (!matches) return;
        draggedCaptures = undefined;
        if (typeof token.isCancellationRequested !== 'boolean')
          throw new Error('The drop cancellation state is unavailable.');
        if (token.isCancellationRequested) return;
        if (target) await noteSource(target, 'note');
        // VS Code may marshal the drop token as a snapshot without its event.
        await promoteBatch(
          drag.items,
          typeof token.onCancellationRequested === 'function' ? token : undefined,
        );
      } catch (error) {
        reportError(error);
      }
    },
  };
  for (const section of treeSections) {
    const provider = new VaultTreeSection(tree, section);
    const view = vscode.window.createTreeView<Item>(`stemlink.${section.toLowerCase()}`, {
      treeDataProvider: provider,
      ...(section === 'Fleeting'
        ? { canSelectMany: true, dragAndDropController: dragController }
        : section === 'Notes'
          ? { dragAndDropController: dropController }
          : {}),
    });
    view.title = section;
    treeViews.set(section, view);
    context.subscriptions.push(provider, view);
  }
  let selectionSync = Promise.resolve();
  let revealingVault: Vault | undefined;
  const syncVaultSelection = (): Promise<void> => {
    const operation = selectionSync.then(async () => {
      const view = treeViews.get('Vaults');
      // Tree refreshes can invalidate an item while VS Code is resolving a reveal.
      for (let attempt = 0; attempt < 3; attempt++) {
        const vault = selectedVault;
        if (!view?.visible || !vault || view.selection[0]?.vault === vault) return;
        const rows = await tree.getChildren(new Item('Vaults', 'Vaults'));
        if (selectedVault !== vault || !view.visible) continue;
        const item = rows.find((row) => row.vault === vault);
        if (!item) return;
        revealingVault = vault;
        try {
          await view.reveal(item, { select: true, focus: false, expand: false });
          return;
        } catch (error) {
          if (selectedVault !== vault || !allVaults().includes(vault) || !view.visible) continue;
          if (attempt === 2) throw error;
        } finally {
          revealingVault = undefined;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    });
    selectionSync = operation.catch(() => {});
    return operation;
  };
  const vaultView = treeViews.get('Vaults');
  if (vaultView)
    context.subscriptions.push(
      vaultView.onDidChangeVisibility((event) => {
        if (event.visible) void syncVaultSelection().catch(reportError);
      }),
    );
  const updateTreeViewMessages = (): void => {
    updateTagFilterView();
    void vscode.commands
      .executeCommand('setContext', 'stemlink.hasVault', vaults.size > 0)
      .then(undefined, reportError);
    void vscode.commands
      .executeCommand('setContext', 'stemlink.discoveryFailed', discoveryFailed)
      .then(undefined, reportError);
    if (vaultView) {
      const count = vaults.size;
      vaultView.badge = count
        ? { value: count, tooltip: `${count} ${count === 1 ? 'vault' : 'vaults'}` }
        : undefined;
    }
    for (const [section, view] of treeViews) {
      view.message =
        section === 'Vaults'
          ? undefined
          : selectedVault
            ? tree.message(section)
            : 'Open or create a vault in Vaults.';
    }
  };
  const updateTreeViewTitles = async (): Promise<void> => {
    updateTagFilterView();
    const items = await tree.getChildren();
    for (const section of treeSections) {
      const item = items.find((candidate) => candidate.kind === section);
      const view = treeViews.get(section);
      if (typeof item?.label === 'string' && view) view.title = item.label;
    }
  };
  context.subscriptions.push(
    tree.onDidChangeTreeData(() => {
      void updateTreeViewTitles().catch(reportError);
      updateTreeViewMessages();
    }),
    tree.onDidChangeVaults(() => void syncVaultSelection().catch(reportError)),
  );
  void updateTreeViewTitles().catch(reportError);
  updateTreeViewMessages();

  const warmIndex = (vault: Vault) => {
    if (background.has(vault) || vault.indexState === 'ready') return;
    const work = vault
      .ensure()
      .catch(reportError)
      .finally(() => {
        background.delete(vault);
        tree.refresh();
      });
    background.set(vault, work);
    tree.refresh();
  };
  const selectVault = async (vault: Vault | undefined): Promise<void> => {
    if (selectedVault !== vault) {
      selectedVault = vault;
      await context.workspaceState.update(selectionKey, vault?.paths.root.toString());
      updateTreeViewMessages();
      if (vault) warmIndex(vault);
      tree.refresh();
    }
    await syncVaultSelection();
  };
  if (vaultView)
    context.subscriptions.push(
      vaultView.onDidChangeSelection((event) => {
        const vault = event.selection[0]?.vault;
        if (vault && vault === revealingVault) return;
        if (vault && vaults.get(vault.paths.root.toString()) === vault && vault !== selectedVault) {
          void selectVault(vault).catch(reportError);
        } else if (!vault) {
          void syncVaultSelection().catch(reportError);
        }
      }),
    );
  const syncVaults = async (preferred?: vscode.Uri): Promise<void> => {
    let failed = false;
    const onError = (error: unknown) => {
      failed = true;
      reportError(error);
    };
    const descriptors = new Map<string, { folder: vscode.WorkspaceFolder; paths: VaultPaths }>();
    const folders = [...(vscode.workspace.workspaceFolders ?? [])].sort(
      (a, b) => b.uri.path.length - a.uri.path.length,
    );
    for (const folder of folders) {
      try {
        for (const paths of await resolveVaultPaths(folder, context.workspaceState, onError)) {
          if (!descriptors.has(paths.root.toString()))
            descriptors.set(paths.root.toString(), { folder, paths });
        }
      } catch (error) {
        onError(error);
      }
    }
    for (const [key, vault] of vaults) {
      const descriptor = descriptors.get(key);
      if (!descriptor || !sameUri(descriptor.folder.uri, vault.folder.uri)) {
        vault.dispose();
        vaults.delete(key);
      }
    }
    for (const [key, descriptor] of descriptors) {
      let vault = vaults.get(key);
      if (!vault) {
        vault = new Vault(descriptor.folder);
        vaults.set(key, vault);
      }
      vault.selectPaths(descriptor.paths);
    }
    discoveryFailed = failed;
    syncRouterIndexes();
    const saved = context.workspaceState.get<string>(selectionKey);
    const wanted = [preferred?.toString(), selectedVault?.paths.root.toString(), saved].find(
      (root) => root !== undefined && vaults.has(root),
    );
    selectedVault = (wanted ? vaults.get(wanted) : undefined) ?? allVaults()[0];
    if (saved !== selectedVault?.paths.root.toString()) {
      await context.workspaceState.update(selectionKey, selectedVault?.paths.root.toString());
    }
    updateTreeViewMessages();
    tree.syncVaults();
    if (selectedVault && selectedVault.indexState === 'pending') warmIndex(selectedVault);
  };
  let pendingDiscovery = Promise.resolve();
  const queueDiscovery = (preferred?: vscode.Uri): Promise<void> => {
    const operation = pendingDiscovery.then(() => syncVaults(preferred));
    pendingDiscovery = operation.catch(reportError);
    return operation;
  };
  const pendingRoot = context.globalState.get<string>(pendingOpenKey);
  const pendingOpen =
    pendingRoot &&
    vscode.workspace.workspaceFolders?.some((folder) =>
      sameUri(folder.uri, vscode.Uri.parse(pendingRoot)),
    )
      ? pendingRoot
      : undefined;
  await queueDiscovery(pendingOpen ? vscode.Uri.parse(pendingOpen) : undefined);
  context.subscriptions.push(
    vscode.lm.registerTool(noteLinksToolName, new NoteLinksTool(allVaults)),
  );
  if (pendingOpen) {
    const vault = vaults.get(pendingOpen);
    if (vault && vscode.workspace.isTrusted) {
      if (routerIndexesEnabled(vault.paths))
        await routerIndexes.initialize(vault.paths).catch(reportError);
      if (agentInstructionsEnabled(vault.paths))
        await agentInstructions.offer(vault.paths).catch(reportError);
    }
    await context.globalState.update(pendingOpenKey, undefined);
  }

  const command = <T extends unknown[]>(name: string, handler: (...args: T) => Promise<void>) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(name, async (...args: unknown[]) => {
        try {
          await handler(...(args as T));
        } catch (error) {
          reportError(error);
        }
      }),
    );

  command('stemlink.openSettings', async () => {
    await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:dmundt.stemlink');
  });

  command('stemlink.filterByTags', async () => {
    const vault = requireActiveVault();
    tagPickerScope?.picker.hide();
    const picker = vscode.window.createQuickPick<TagPickItem>();
    const scope = { picker, vault, notesPath: vault.paths.notes.toString() };
    tagPickerScope = scope;
    picker.title = 'Filter by tags';
    picker.placeholder = 'Select tags; notes matching any selected tag are shown.';
    picker.canSelectMany = true;
    picker.matchOnDescription = false;
    picker.matchOnDetail = false;
    picker.busy = true;
    picker.enabled = false;
    const subscriptions = [
      picker.onDidAccept(() => {
        if (
          tagPickerScope === scope &&
          selectedVault === vault &&
          allVaults().includes(vault) &&
          scope.notesPath === vault.paths.notes.toString() &&
          !picker.busy
        ) {
          tree.setTagFilter(
            vault,
            picker.selectedItems.map((item) => item.tag),
          );
          updateTagFilterView();
        }
        picker.hide();
      }),
      picker.onDidHide(() => {
        if (tagPickerScope === scope) tagPickerScope = undefined;
        subscriptions.forEach((subscription) => subscription.dispose());
        picker.dispose();
      }),
    ];
    picker.show();
    try {
      const choices = await tree.tagChoices(vault);
      if (tagPickerScope !== scope) return;
      updateTagFilterView();
      if (tagPickerScope !== scope) return;
      const selected = new Set(tree.tagFilter(vault));
      if (!choices.length)
        picker.placeholder = 'No tags in this vault. Add YAML tags, for example: tags: [idea].';
      picker.items = choices.map(({ tag, count }) => ({
        label: tag,
        tag,
        description: `${count} ${count === 1 ? 'note' : 'notes'}`,
      }));
      picker.selectedItems = picker.items.filter((item) => selected.has(item.tag));
      picker.busy = false;
      picker.enabled = true;
    } catch (error) {
      if (tagPickerScope === scope) picker.hide();
      throw error;
    }
  });
  command('stemlink.clearTagFilter', async () => {
    tree.setTagFilter(requireActiveVault(), []);
    tagPickerScope?.picker.hide();
    updateTagFilterView();
  });

  command('stemlink.selectVault', async (root: vscode.Uri) => {
    const vault = vaults.get(root.toString());
    if (!vault) throw new Error('The selected vault is no longer available.');
    await selectVault(vault);
  });

  command('stemlink.openAt', async (uri: vscode.Uri, offset?: number) => {
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    if (offset !== undefined) {
      const position = document.positionAt(offset);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    }
  });

  async function writeMarker(
    root: vscode.Uri,
    inbox: string,
    notes: string,
    templates: string,
  ): Promise<void> {
    if (!vscode.workspace.isTrusted)
      throw new Error('Trust the workspace before adding a vault marker.');
    const marker = vscode.Uri.joinPath(root, '.stemlink.json');
    const edit = new vscode.WorkspaceEdit();
    edit.createFile(marker, { overwrite: false, ignoreIfExists: false });
    const mapping = { version: 1, inbox, notes, templates };
    if (!validFolderName(templates))
      throw new Error('The templates folder must be a valid folder name.');
    if ([inbox, notes].some((name) => name.toLowerCase() === templates.toLowerCase())) {
      throw new Error('The templates folder must be distinct from inbox and notes.');
    }
    edit.insert(marker, new vscode.Position(0, 0), `${JSON.stringify(mapping, null, 2)}\n`);
    if (!(await vscode.workspace.applyEdit(edit)))
      throw new Error(`Could not create ${marker.path}; no existing file was overwritten.`);
    const document = await vscode.workspace.openTextDocument(marker);
    if (!(await document.save())) throw new Error(`Created ${marker.path} but could not save it.`);
  }

  command('stemlink.openVault', async () => {
    if (!vscode.workspace.isTrusted) throw new Error('Trust the workspace before opening a vault.');
    const roots = await vscode.window.showOpenDialog({
      title: 'Open vault',
      openLabel: 'Open vault',
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
    });
    const root = roots?.[0];
    if (!root) return;
    if (!((await vscode.workspace.fs.stat(root)).type & vscode.FileType.Directory)) {
      throw new Error('Choose a vault folder.');
    }
    const marker = await readVaultMarker(root);
    if (!marker) {
      const answer = await vscode.window.showWarningMessage(
        'This folder has no .stemlink.json. Add a marker using existing inbox and permanent-note folders?',
        { modal: true },
        'Add Marker',
      );
      if (answer !== 'Add Marker') return;
      const directories = (await vscode.workspace.fs.readDirectory(root))
        .filter(
          ([name, type]) => Boolean(type & vscode.FileType.Directory) && validFolderName(name),
        )
        .map(([label]) => ({ label }))
        .sort((a, b) => a.label.localeCompare(b.label));
      if (directories.length < 2)
        throw new Error(
          'The vault needs two distinct existing folders for captures and permanent notes.',
        );
      const inbox = await vscode.window.showQuickPick(directories, {
        title: 'Choose fleeting/capture folder',
      });
      if (!inbox) return;
      const noteDirectories = directories.filter(
        (item) => item.label.toLowerCase() !== inbox.label.toLowerCase(),
      );
      if (!noteDirectories.length)
        throw new Error(
          'The vault needs two distinct existing folders for captures and permanent notes.',
        );
      const notes = await vscode.window.showQuickPick(noteDirectories, {
        title: 'Choose permanent-note folder',
      });
      if (!notes) return;
      for (const name of [inbox.label, notes.label]) {
        if (
          !(
            (await vscode.workspace.fs.stat(vscode.Uri.joinPath(root, name))).type &
            vscode.FileType.Directory
          )
        ) {
          throw new Error(`The selected ${name} is no longer a directory.`);
        }
      }
      const templates = vscode.workspace
        .getConfiguration('stemlink', root)
        .get<string>('templates', 'templates');
      await writeMarker(root, inbox.label, notes.label, templates);
    }
    if (!vscode.workspace.isTrusted) throw new Error('Trust the workspace before opening a vault.');
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.some((folder) => sameUri(root, folder.uri) || directChild(root, folder.uri))) {
      await queueDiscovery(root);
      const vault = vaults.get(root.toString());
      if (vault) {
        if (routerIndexesEnabled(vault.paths)) await routerIndexes.initialize(vault.paths);
        if (agentInstructionsEnabled(vault.paths)) await agentInstructions.offer(vault.paths);
      }
      return;
    }
    if (!folders.length) {
      await context.globalState.update(pendingOpenKey, root.toString());
      try {
        await vscode.commands.executeCommand('vscode.openFolder', root, false);
      } catch (error) {
        await context.globalState.update(pendingOpenKey, undefined);
        throw error;
      }
      return;
    }
    if (!vscode.workspace.workspaceFile) {
      await context.globalState.update(pendingOpenKey, root.toString());
      if (!vscode.workspace.updateWorkspaceFolders(folders.length, 0, { uri: root })) {
        await context.globalState.update(pendingOpenKey, undefined);
        throw new Error('Could not add the vault folder to the workspace.');
      }
      return;
    }
    let subscription: vscode.Disposable | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const added = new Promise<void>((resolve, reject) => {
      subscription = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        if (event.added.some((folder) => sameUri(folder.uri, root))) resolve();
      });
      timer = setTimeout(
        () => reject(new Error('Adding the vault folder to the workspace timed out.')),
        5000,
      );
    });
    try {
      if (!vscode.workspace.updateWorkspaceFolders(folders.length, 0, { uri: root })) {
        throw new Error('Could not add the vault folder to the workspace.');
      }
      await added;
    } finally {
      subscription?.dispose();
      if (timer) clearTimeout(timer);
    }
    await queueDiscovery(root);
    const vault = vaults.get(root.toString());
    if (vault) {
      if (routerIndexesEnabled(vault.paths)) await routerIndexes.initialize(vault.paths);
      if (agentInstructionsEnabled(vault.paths)) await agentInstructions.offer(vault.paths);
    }
  });

  command('stemlink.createVault', async () => {
    if (!vscode.workspace.isTrusted)
      throw new Error('Trust the workspace before creating a vault.');
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) throw new Error('Open a workspace folder first.');
    const selected =
      folders.length === 1
        ? folders[0]
        : await vscode.window.showWorkspaceFolderPick({
            placeHolder: 'Choose a workspace for the vault',
          });
    if (!selected) return;
    const config = vscode.workspace.getConfiguration('stemlink', selected.uri);
    const prompt = async (
      label: string,
      value: string,
      validateCollision?: (input: string) => string | undefined,
    ) => {
      const validateInput = (input: string) =>
        !validFolderName(input)
          ? 'Enter a single valid folder name.'
          : isReservedFolderName(input)
            ? 'Choose a folder name that is not a reserved Windows device name.'
            : validateCollision?.(input);
      const answer = await vscode.window.showInputBox({
        title: `Create vault: ${label}`,
        value,
        validateInput,
      });
      if (answer !== undefined) {
        const problem = validateInput(answer);
        if (problem) throw new Error(problem);
      }
      return answer;
    };
    const root = await prompt('root folder', config.get<string>('root', 'notes'));
    if (root === undefined) return;
    const rootUri = vscode.Uri.joinPath(selected.uri, root);
    const existingMarker = await readVaultMarker(rootUri);
    const templateSetting = config.inspect<string>('templates');
    const templatesExplicit = [
      templateSetting?.globalValue,
      templateSetting?.workspaceValue,
      templateSetting?.workspaceFolderValue,
    ].some((value) => value !== undefined);
    const templatesName =
      existingMarker && !templatesExplicit
        ? existingMarker.templates.path.slice(existingMarker.templates.path.lastIndexOf('/') + 1)
        : config.get<string>('templates', 'templates');
    if (!validFolderName(templatesName) || isReservedFolderName(templatesName)) {
      const choice = await vscode.window.showErrorMessage(
        'Stemlink: The templates folder must be a valid folder name, not a reserved Windows device name.',
        'Settings',
      );
      if (choice === 'Settings') await vscode.commands.executeCommand('stemlink.openSettings');
      return;
    }
    const templateCollision = (input: string) =>
      input.toLowerCase() === templatesName.toLowerCase()
        ? 'The templates folder must be distinct from inbox and notes.'
        : undefined;
    const inbox = await prompt(
      'inbox folder',
      config.get<string>('inbox', 'inbox'),
      templateCollision,
    );
    if (inbox === undefined) return;
    const notes = await prompt(
      'permanent-note folder',
      config.get<string>('notes', 'permanent'),
      (input) =>
        templateCollision(input) ??
        (input.toLowerCase() === inbox.toLowerCase()
          ? 'Inbox and notes must be different folders.'
          : undefined),
    );
    if (notes === undefined) return;
    const configured = ['root', 'inbox', 'notes', 'templates'].some((key) => {
      const info = config.inspect(key);
      return info?.workspaceValue !== undefined || info?.workspaceFolderValue !== undefined;
    });
    let exists = false;
    try {
      await vscode.workspace.fs.stat(rootUri);
      exists = true;
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) throw error;
    }
    if (exists || configured) {
      const answer = await vscode.window.showWarningMessage(
        'The folder or Stemlink workspace settings already exist. Reuse the folder and replace the Stemlink paths?',
        { modal: true },
        'Continue',
      );
      if (answer !== 'Continue') return;
    }
    const desiredPaths: VaultPaths = {
      root: rootUri,
      inbox: vscode.Uri.joinPath(rootUri, inbox),
      notes: vscode.Uri.joinPath(rootUri, notes),
      templates: vscode.Uri.joinPath(rootUri, templatesName),
    };
    if (existingMarker && !samePaths(existingMarker, desiredPaths)) {
      throw new Error(
        `The existing ${rootUri.path}/.stemlink.json specifies different folders. Update it before reusing this vault.`,
      );
    }
    if (!vscode.workspace.isTrusted)
      throw new Error('Trust the workspace before creating a vault.');
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, inbox));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, notes));
    const templateDirectory = desiredPaths.templates;
    await vscode.workspace.fs.createDirectory(templateDirectory);
    const preserved: string[] = [];
    if (existingMarker) preserved.push('.stemlink.json');
    const manualSource = vscode.Uri.joinPath(context.extensionUri, 'templates', 'README.md');
    const manualText = Buffer.from(await vscode.workspace.fs.readFile(manualSource)).toString(
      'utf8',
    );
    const manual = vscode.Uri.joinPath(rootUri, 'README.md');
    let manualExists = false;
    try {
      manualExists = Boolean((await vscode.workspace.fs.stat(manual)).type & vscode.FileType.File);
      if (!manualExists) throw new Error('Vault README.md path is not a file.');
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) throw error;
    }
    if (manualExists) {
      preserved.push('README.md');
    } else {
      const manualEdit = new vscode.WorkspaceEdit();
      manualEdit.createFile(manual, {
        overwrite: false,
        ignoreIfExists: false,
        contents: Buffer.from(
          renderVaultReadme(
            manualText,
            rootUri.path.slice(rootUri.path.lastIndexOf('/') + 1),
            inbox,
            notes,
            templatesName,
          ),
          'utf8',
        ),
      });
      let manualCreated = false;
      try {
        manualCreated = await vscode.workspace.applyEdit(manualEdit);
      } catch (error) {
        if (!(error instanceof vscode.FileSystemError && error.code === 'FileExists')) throw error;
      }
      if (!manualCreated) {
        const stat = await vscode.workspace.fs.stat(manual);
        if (!(stat.type & vscode.FileType.File))
          throw new Error('Vault README.md path is not a file.');
        preserved.push('README.md');
      }
    }
    for (const name of ['_template.md', '_fleeting.md', '_promotion.md']) {
      const destination = vscode.Uri.joinPath(templateDirectory, name);
      const template = vscode.Uri.joinPath(context.extensionUri, 'templates', name);
      try {
        await vscode.workspace.fs.copy(template, destination, { overwrite: false });
      } catch (error) {
        if (!(error instanceof vscode.FileSystemError && error.code === 'FileExists')) throw error;
        if (!((await vscode.workspace.fs.stat(destination)).type & vscode.FileType.File)) {
          throw new Error(`The vault's ${name} exists but is not a file.`, { cause: error });
        }
        preserved.push(`${templatesName}/${name}`);
      }
    }
    if (routerIndexesEnabled(desiredPaths))
      preserved.push(...(await routerIndexes.initialize(desiredPaths)));
    const target =
      folders.length > 1
        ? vscode.ConfigurationTarget.WorkspaceFolder
        : vscode.ConfigurationTarget.Workspace;
    const keys = ['root', 'inbox', 'notes', 'templates'] as const;
    const values = [root, inbox, notes, templatesName];
    const previous = keys.map((key) => {
      const inspected = config.inspect<string>(key);
      return target === vscode.ConfigurationTarget.WorkspaceFolder
        ? inspected?.workspaceFolderValue
        : inspected?.workspaceValue;
    });
    configuring = true;
    try {
      for (let i = 0; i < keys.length; i++) await config.update(keys[i], values[i], target);
      if (!existingMarker) {
        await writeMarker(rootUri, inbox, notes, templatesName);
      }
    } catch (error) {
      try {
        for (let i = 0; i < keys.length; i++) await config.update(keys[i], previous[i], target);
      } catch (rollbackError) {
        throw new Error(
          `Could not save vault settings: ${String(error)}. Settings rollback also failed: ${String(rollbackError)}`,
          { cause: rollbackError },
        );
      }
      throw error;
    } finally {
      configuring = false;
    }
    await queueDiscovery(rootUri);
    const vault = vaults.get(rootUri.toString());
    if (vault && agentInstructionsEnabled(vault.paths)) await agentInstructions.offer(vault.paths);
    tree.refresh();
    if (preserved.length)
      void vscode.window.showWarningMessage(
        `Stemlink: Vault ready; existing ${preserved.join(', ')} ${preserved.length === 1 ? 'was' : 'were'} preserved.`,
      );
    else void vscode.window.showInformationMessage('Stemlink: Vault ready.');
  });

  async function askMetadata(
    purpose: string,
    defaultTitle = '',
    defaultTags: string[] = [],
    reuse: { title: boolean; tags: boolean } = { title: false, tags: false },
    token?: vscode.CancellationToken,
  ): Promise<{ title: string; tags: string[] } | undefined> {
    const title =
      reuse.title && defaultTitle.trim()
        ? defaultTitle
        : await vscode.window.showInputBox({
            title: purpose,
            prompt: 'Note title',
            value: defaultTitle,
            validateInput: (value) => (value.trim() ? undefined : 'Enter a title.'),
          });
    if (title === undefined || token?.isCancellationRequested) return undefined;
    const rawTags =
      reuse.tags && defaultTags.some((tag) => tag.trim())
        ? defaultTags.join(', ')
        : await vscode.window.showInputBox({
            title: purpose,
            prompt: 'Tags (comma-separated, optional)',
            value: defaultTags.join(', '),
          });
    if (rawTags === undefined) return undefined;
    return {
      title: title.trim(),
      tags:
        reuse.tags && defaultTags.some((tag) => tag.trim())
          ? defaultTags
          : rawTags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
    };
  }

  async function createFile(
    directory: vscode.Uri,
    title: string,
    text: string,
  ): Promise<vscode.Uri> {
    const base = `${timestamp(new Date())}-${slug(title)}`;
    for (let suffix = 1; ; suffix++) {
      const uri = vscode.Uri.joinPath(directory, `${base}${suffix === 1 ? '' : `-${suffix}`}.md`);
      try {
        await vscode.workspace.fs.stat(uri);
        continue;
      } catch (error) {
        if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound'))
          throw error;
      }
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, { overwrite: false, ignoreIfExists: false });
      edit.insert(uri, new vscode.Position(0, 0), text);
      if (!(await vscode.workspace.applyEdit(edit)))
        throw new Error('Could not create the note; no existing file was overwritten.');
      const doc = await vscode.workspace.openTextDocument(uri);
      if (!(await doc.save())) throw new Error(`Created ${uri.path} but could not save it.`);
      return uri;
    }
  }

  async function addFleetingNote(vault: Vault): Promise<void> {
    if (!vscode.workspace.isTrusted)
      throw new Error('Trust the workspace before creating a capture.');
    registeredVault(vault);
    const destination = vault.paths.inbox.toString();
    let headline: string | undefined;
    if (
      vscode.workspace
        .getConfiguration('stemlink', vault.paths.root)
        .get<boolean>('promptForCaptureHeadline', true)
    ) {
      headline = await vscode.window.showInputBox({
        title: 'Capture headline',
        prompt: `Describe this fleeting thought for ${tree.vaultLabel(vault)}.`,
        validateInput: (value) => (value.trim() ? undefined : 'Enter a headline.'),
      });
      if (headline === undefined) return;
      headline = headline.trim();
    }
    if (vault.paths.inbox.toString() !== destination)
      throw new Error("The vault's inbox folder changed; try again.");
    const template = vscode.Uri.joinPath(vault.paths.templates, '_fleeting.md');
    const legacyTemplate = vscode.Uri.joinPath(vault.paths.notes, '_fleeting.md');
    let text: string;
    try {
      text = Buffer.from(await vscode.workspace.fs.readFile(template)).toString('utf8');
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) throw error;
      try {
        text = Buffer.from(await vscode.workspace.fs.readFile(legacyTemplate)).toString('utf8');
      } catch (legacyError) {
        if (legacyError instanceof vscode.FileSystemError && legacyError.code === 'FileNotFound') {
          const choice = await vscode.window.showWarningMessage(
            `Stemlink: Fleeting template not found at ${template.path} or ${legacyTemplate.path}.`,
            'Use bundled template once',
          );
          if (choice !== 'Use bundled template once') return;
          text = Buffer.from(
            await vscode.workspace.fs.readFile(
              vscode.Uri.joinPath(context.extensionUri, 'templates', '_fleeting.md'),
            ),
          ).toString('utf8');
        } else throw legacyError;
      }
    }
    if (!vscode.workspace.isTrusted)
      throw new Error('Trust the workspace before creating a capture.');
    registeredVault(vault);
    if (vault.paths.inbox.toString() !== destination)
      throw new Error("The vault's inbox folder changed; try again.");
    if (!((await vscode.workspace.fs.stat(vault.paths.inbox)).type & vscode.FileType.Directory))
      throw new Error("The vault's inbox path is not a folder.");
    const name = headline ? slug(headline).slice(0, 48).replace(/-+$/g, '') : 'capture';
    const uri = await createFile(
      vault.paths.inbox,
      name,
      headline ? makeCapture(text, headline) : text,
    );
    tree.refresh();
    await vscode.window.showTextDocument(uri);
  }
  command('stemlink.addFleetingNote', async () => {
    await addFleetingNote(requireActiveVault());
  });
  command('stemlink.newFleetingNote', async (item?: Item) => {
    await addFleetingNote(itemVault(item));
  });

  function registeredVault(vault: Vault): Vault {
    if (vaults.get(vault.paths.root.toString()) !== vault)
      throw new Error('The selected vault is no longer available.');
    return vault;
  }

  function explainFilteredCreation(vault: Vault, uri: vscode.Uri): void {
    if (selectedVault !== vault || tree.isVisibleNote(vault, uri)) return;
    void vscode.window
      .showInformationMessage(
        `Stemlink: Created note in ${tree.vaultLabel(vault)} is not shown by the active tag filter.`,
        'Clear tag filter',
      )
      .then((choice) => {
        if (
          choice === 'Clear tag filter' &&
          selectedVault === vault &&
          vaults.get(vault.paths.root.toString()) === vault
        ) {
          tree.setTagFilter(vault, []);
          updateTagFilterView();
        }
      })
      .then(undefined, reportError);
  }

  function itemVault(item?: Item): Vault {
    if (item?.kind !== 'vault' || !item.vault)
      throw new Error('Select a vault from its context menu.');
    return registeredVault(item.vault);
  }

  async function addNote(vault: Vault): Promise<void> {
    if (!vscode.workspace.isTrusted) throw new Error('Trust the workspace before creating a note.');
    registeredVault(vault);
    const destination = vault.paths.notes.toString();
    const metadata = await askMetadata(`New permanent note: ${vault.paths.root.fsPath}`);
    if (!metadata) return;
    if (!vscode.workspace.isTrusted) throw new Error('Trust the workspace before creating a note.');
    registeredVault(vault);
    if (vault.paths.notes.toString() !== destination)
      throw new Error("The vault's notes folder changed; try again.");
    const uri = await createFile(
      vault.paths.notes,
      metadata.title,
      makeNote(metadata.title, metadata.tags),
    );
    await vault.recordFile(uri);
    tree.refresh();
    await vscode.window.showTextDocument(uri);
    explainFilteredCreation(vault, uri);
  }
  command('stemlink.addNote', async () => {
    await addNote(requireActiveVault());
  });
  command('stemlink.newPermanentNote', async (item?: Item) => {
    await addNote(itemVault(item));
  });

  async function noteSource(item: Item | undefined, kind: 'capture' | 'note') {
    if (!vscode.workspace.isTrusted)
      throw new Error(`Trust the workspace before changing a ${kind}.`);
    const uri = item?.uri;
    const vault = uri ? vaultFor(uri) : undefined;
    const name = uri?.path.slice(uri.path.lastIndexOf('/') + 1) ?? '';
    const description = kind === 'capture' ? 'inbox Markdown capture' : 'permanent Markdown note';
    if (
      !uri ||
      !vault ||
      !directChild(uri, kind === 'capture' ? vault.paths.inbox : vault.paths.notes) ||
      !uri.path.endsWith('.md') ||
      isExcludedNoteFile(name)
    ) {
      throw new Error(
        `Select a${kind === 'capture' ? 'n' : ''} ${description} from its context menu.`,
      );
    }
    if (!((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.File))
      throw new Error(`Select a${kind === 'capture' ? 'n' : ''} ${description} file.`);
    const doc = await vscode.workspace.openTextDocument(uri);
    return { uri, vault, name, doc };
  }
  const captureSource = (item?: Item) => noteSource(item, 'capture');

  const suggestedCaptureTitle = (name: string) =>
    name
      .slice(0, -3)
      .replace(/^\d{12}-/, '')
      .replace(/-/g, ' ');

  async function editMetadata(item: Item | undefined, kind: 'capture' | 'note') {
    const { uri, doc } = await noteSource(item, kind);
    const wasDirty = doc.isDirty;
    const snapshot = doc.getText();
    const version = doc.version;
    const originalBytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
    const existing = captureMetadata(snapshot);
    const metadata = await askMetadata(
      `Edit metadata: ${uri.fsPath}`,
      existing.title ?? '',
      existing.tags,
    );
    if (!metadata) return;
    await noteSource(item, kind);
    const currentBytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
    if (doc.version !== version || !currentBytes.equals(originalBytes))
      throw new Error(
        `${kind === 'capture' ? 'Capture' : 'Note'} changed while editing metadata; try again.`,
      );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      uri,
      new vscode.Range(doc.positionAt(0), doc.positionAt(snapshot.length)),
      promoteNote(snapshot, metadata.title, metadata.tags),
    );
    if (!(await vscode.workspace.applyEdit(edit)))
      throw new Error(`Could not update ${kind} metadata.`);
    if (!wasDirty && !(await doc.save()))
      throw new Error(
        `${kind === 'capture' ? 'Capture' : 'Note'} metadata was updated in the editor but could not be saved.`,
      );
    tree.refresh();
  }
  command('stemlink.editCaptureMetadata', async (item?: Item, selection?: Item[]) => {
    if (selection && selection.length > 1) throw new Error('Select one capture to edit metadata.');
    await editMetadata(item, 'capture');
  });
  command('stemlink.editNoteMetadata', async (item?: Item) => {
    await editMetadata(item, 'note');
  });

  async function deleteCapture(item?: Item) {
    const { uri, name, doc } = await captureSource(item);
    if (doc.isDirty) throw new Error('Save or revert unsaved capture changes before deletion.');
    const version = doc.version;
    const originalBytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
    const choice = await vscode.window.showWarningMessage(
      `Delete capture "${name}"?`,
      {
        modal: true,
        detail: 'The capture will be deleted from the inbox.',
      },
      'Delete',
    );
    if (choice !== 'Delete') return;
    await captureSource(item);
    const currentBytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
    if (doc.isDirty || doc.version !== version || !currentBytes.equals(originalBytes))
      throw new Error('Capture changed while confirming deletion; nothing was deleted.');
    const deletion = new vscode.WorkspaceEdit();
    deletion.deleteFile(uri);
    if (!(await vscode.workspace.applyEdit(deletion)))
      throw new Error('Capture could not be deleted.');
    tree.refresh();
  }
  command('stemlink.discardCapture', async (item?: Item, selection?: Item[]) => {
    if (selection && selection.length > 1) throw new Error('Select one capture to delete.');
    await deleteCapture(item);
  });

  const promoting = new Set<string>();
  async function promoteCapture(
    item?: Item,
    token?: vscode.CancellationToken,
    batchTargets?: vscode.Uri[],
  ): Promise<boolean> {
    const key = item?.uri?.toString();
    if (!key) throw new Error('Select an inbox Markdown capture from its context menu.');
    if (promoting.has(key)) throw new Error('This capture is already being promoted.');
    promoting.add(key);
    try {
      return await performPromotion(item, token, batchTargets);
    } finally {
      promoting.delete(key);
    }
  }
  async function performPromotion(
    item?: Item,
    token?: vscode.CancellationToken,
    batchTargets?: vscode.Uri[],
  ): Promise<boolean> {
    if (token?.isCancellationRequested) return false;
    const { uri, vault, name, doc } = await captureSource(item);
    const destination = vault.paths.notes.toString();
    const snapshot = doc.getText();
    const version = doc.version;
    const originalBytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
    const existing = captureMetadata(snapshot);
    if (
      vscode.workspace
        .getConfiguration('stemlink', vault.paths.root)
        .get<boolean>('confirmPromotion', true)
    ) {
      const answer = await vscode.window.showWarningMessage(
        `Promote capture "${name}"?`,
        { modal: true, detail: `Create a permanent note in ${vault.paths.notes.fsPath}.` },
        'Promote',
      );
      if (answer !== 'Promote' || token?.isCancellationRequested) return false;
    }
    const force = vscode.workspace
      .getConfiguration('stemlink', vault.paths.root)
      .get<boolean>('promptForPromotionMetadata', false);
    const metadata = await askMetadata(
      `Promote to permanent note: ${uri.fsPath}`,
      existing.title?.trim() || suggestedCaptureTitle(name),
      existing.tags,
      { title: !force && !!existing.title?.trim(), tags: !force },
      token,
    );
    if (!metadata || token?.isCancellationRequested) return false;
    await captureSource(item);
    if (!allVaults().includes(vault) || vault.paths.notes.toString() !== destination)
      throw new Error("The capture's vault is no longer available.");
    const currentBytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
    if (doc.version !== version || !currentBytes.equals(originalBytes))
      throw new Error('Capture changed during promotion; try again.');
    if (token?.isCancellationRequested) return false;
    if (doc.isDirty && !(await doc.save()))
      throw new Error('Could not save the capture; promotion cancelled.');
    const savedBytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
    if (doc.getText() !== snapshot)
      throw new Error('Capture changed while saving; promotion cancelled.');
    const text = promoteNote(snapshot, metadata.title, metadata.tags);
    const target = await createFile(vault.paths.notes, metadata.title, text);
    batchTargets?.push(target);
    try {
      const currentBytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
      if (doc.getText() !== snapshot || !currentBytes.equals(savedBytes)) {
        throw new Error('capture changed during promotion and was retained');
      }
      await vscode.workspace.fs.delete(uri);
    } catch (error) {
      throw new Error(
        `Note created at ${target.path}, but capture could not be removed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    await vault.recordFile(target);
    tree.refresh();
    if (!batchTargets) {
      await vscode.window.showTextDocument(target);
      explainFilteredCreation(vault, target);
    }
    return true;
  }
  async function promoteBatch(items: Item[], token?: vscode.CancellationToken): Promise<void> {
    if (dropping) throw new Error('A promotion batch is already running.');
    const captures = new Map<string, Item>();
    for (const item of items) {
      if (!item.uri) throw new Error('Selected capture has no file.');
      captures.set(item.uri.toString(), item);
    }
    if (!captures.size) throw new Error('Select a capture to promote.');
    const cancellation = new vscode.CancellationTokenSource();
    let subscription: vscode.Disposable | undefined;
    const targets: vscode.Uri[] = [];
    let completed = 0;
    let outcome = 'completed';
    dropping = true;
    try {
      subscription = token?.onCancellationRequested(() => cancellation.cancel());
      if (token?.isCancellationRequested) cancellation.cancel();
      if (captures.size === 1) {
        await promoteCapture([...captures.values()][0], cancellation.token);
        return;
      }
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Promoting captures',
          cancellable: true,
        },
        async (progress, progressToken) => {
          const progressSubscription = progressToken.onCancellationRequested(() =>
            cancellation.cancel(),
          );
          try {
            for (const item of captures.values()) {
              if (!(await promoteCapture(item, cancellation.token, targets))) {
                outcome = 'cancelled';
                break;
              }
              completed++;
              progress.report({
                increment: 100 / captures.size,
                message: `${completed} of ${captures.size}`,
              });
            }
          } finally {
            progressSubscription.dispose();
          }
        },
      );
    } catch (error) {
      outcome = 'failed';
      reportError(error);
    } finally {
      subscription?.dispose();
      cancellation.dispose();
      dropping = false;
      if (captures.size > 1) {
        const partial =
          targets.length > completed
            ? ' An additional permanent note was created; see the error for incomplete promotion details.'
            : '';
        void vscode.window.showInformationMessage(
          `Stemlink: Promotion ${outcome}: ${completed} of ${captures.size} captures promoted; ${captures.size - completed} not fully promoted.${partial}`,
        );
        const last = targets[targets.length - 1];
        if (last) {
          await vscode.window.showTextDocument(last).then(undefined, reportError);
          const vault = vaultFor(last);
          if (vault) explainFilteredCreation(vault, last);
        }
      }
    }
  }
  command('stemlink.promote', async (item?: Item, selection?: Item[]) => {
    if (selection && selection.length > 1) await promoteBatch(selection);
    else await promoteCapture(item);
  });

  command('stemlink.refresh', async () => {
    await queueDiscovery();
    const vault = activeVault();
    if (!vault) {
      tree.refresh();
      return;
    }
    tree.reset(vault);
    await vault.refresh();
    if (vscode.workspace.isTrusted && routerIndexesEnabled(vault.paths))
      await routerIndexes.refresh(vault.paths);
    tree.refresh();
  });

  async function validateVault(vault: Vault): Promise<void> {
    registeredVault(vault);
    await vault.refresh();
    registeredVault(vault);
    const notes = vault.all;
    const findings = auditNotes(notes);
    const grouped = new Map<string, vscode.Diagnostic[]>();
    for (const finding of findings) {
      const range = new vscode.Range(
        textPosition(finding.note.text, finding.start),
        textPosition(finding.note.text, finding.end),
      );
      const severity =
        finding.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : finding.severity === 'warning'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information;
      const diagnostic = new vscode.Diagnostic(range, finding.message, severity);
      diagnostic.source = 'Stemlink';
      const list = grouped.get(finding.note.uri.toString()) ?? [];
      list.push(diagnostic);
      grouped.set(finding.note.uri.toString(), list);
    }
    const replacement: [vscode.Uri, vscode.Diagnostic[]][] = notes.flatMap((note) => {
      const list = grouped.get(note.uri.toString());
      return list ? [[note.uri, list]] : [];
    });
    diagnostics.clear();
    diagnostics.set(replacement);
    const count = (severity: string) =>
      findings.filter((finding) => finding.severity === severity).length;
    void vscode.window
      .showInformationMessage(
        `Stemlink: ${vault.paths.root.fsPath}: ${count('error')} errors, ${count('warning')} warnings, ${count('info')} info across ${notes.length} permanent notes. Previous Stemlink validation results replaced.`,
        'Show Problems',
      )
      .then((answer) =>
        answer === 'Show Problems'
          ? vscode.commands.executeCommand('workbench.actions.view.problems')
          : undefined,
      )
      .then(undefined, reportError);
  }
  command('stemlink.checkReferences', async () => {
    await validateVault(requireActiveVault());
  });
  command('stemlink.validateVault', async (item?: Item) => {
    await validateVault(itemVault(item));
  });

  const selector: vscode.DocumentSelector = [{ language: 'markdown' }];
  const linkAt = (document: vscode.TextDocument, position: vscode.Position) => {
    const offset = document.offsetAt(position);
    return linksIn(document.getText()).find(
      (link) => link.valid && link.start <= offset && offset < link.end,
    );
  };
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(selector, {
      async provideDocumentLinks(document) {
        const vault = vaultFor(document.uri);
        if (!vault) return [];
        await vault.ensureNames();
        return linksIn(document.getText()).flatMap((link) => {
          const target = link.valid ? vault.target(link.stem) : undefined;
          return target
            ? [
                new vscode.DocumentLink(
                  new vscode.Range(document.positionAt(link.start), document.positionAt(link.end)),
                  target.uri,
                ),
              ]
            : [];
        });
      },
    }),
  );
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position) {
        const vault = vaultFor(document.uri);
        const link = linkAt(document, position);
        if (!vault || !link) return undefined;
        await vault.ensureNames();
        const target = vault.target(link.stem);
        return target ? new vscode.Location(target.uri, new vscode.Position(0, 0)) : undefined;
      },
    }),
  );
  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(selector, {
      async provideReferences(document, position) {
        const vault = vaultFor(document.uri);
        if (!vault) return [];
        await vault.ensure();
        const link = linkAt(document, position);
        if (!link && !directChild(document.uri, vault.paths.notes)) return [];
        const name = document.uri.path.slice(document.uri.path.lastIndexOf('/') + 1);
        const stem = link?.stem ?? (name.endsWith('.md') ? name.slice(0, -3) : '');
        return vault.references(stem).map((ref) => {
          const prefix = ref.note.text.slice(0, ref.link.start);
          const line = prefix.split('\n').length - 1;
          const character = ref.link.start - (prefix.lastIndexOf('\n') + 1);
          return new vscode.Location(ref.note.uri, new vscode.Position(line, character));
        });
      },
    }),
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      {
        async provideCompletionItems(document, position) {
          const line = document.lineAt(position.line).text;
          const before = line.slice(0, position.character);
          const match = /\[\[([^\][\r\n]*)$/.exec(before);
          if (!match) return [];
          const vault = vaultFor(document.uri);
          if (!vault) return [];
          await vault.ensureNames();
          const closes = line.slice(position.character).startsWith(']]');
          return vault.allTargets
            .filter((note) => !sameUri(note.uri, document.uri))
            .map((note) => {
              const item = new vscode.CompletionItem(
                note.stem,
                vscode.CompletionItemKind.Reference,
              );
              item.insertText = `${note.stem}${closes ? '' : ']]'}`;
              item.range = new vscode.Range(
                position.line,
                position.character - match[1].length,
                position.line,
                position.character,
              );
              return item;
            });
        },
      },
      '[',
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles((event) => {
      for (const file of event.files) {
        const vault = vaultFor(file.oldUri);
        if (
          vault &&
          ((directChild(file.oldUri, vault.paths.notes) && file.oldUri.path.endsWith('.md')) ||
            sameUri(file.oldUri, vault.paths.notes) ||
            sameUri(file.oldUri, vault.paths.root))
        ) {
          void vscode.window.showWarningMessage(
            'Stemlink: a permanent note or vault folder was renamed. References may be broken; run Validate vault.',
          );
        }
      }
    }),
  );
  let discoveryTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleDiscovery = () => {
    if (discoveryTimer) clearTimeout(discoveryTimer);
    discoveryTimer = setTimeout(() => {
      if (configuring) {
        scheduleDiscovery();
        return;
      }
      void queueDiscovery();
    }, 100);
  };
  const markerWatcher = vscode.workspace.createFileSystemWatcher('**/.stemlink.json');
  const markerChanged = (uri: vscode.Uri) => {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const parent = uri.with({ path: uri.path.slice(0, uri.path.lastIndexOf('/')) });
    if (folder && (sameUri(parent, folder.uri) || directChild(parent, folder.uri)))
      scheduleDiscovery();
  };
  context.subscriptions.push(
    markerWatcher,
    markerWatcher.onDidCreate(markerChanged),
    markerWatcher.onDidChange(markerChanged),
    markerWatcher.onDidDelete(markerChanged),
    new vscode.Disposable(() => {
      if (discoveryTimer) clearTimeout(discoveryTimer);
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (configuring) return;
      if (
        ['root', 'inbox', 'notes', 'templates'].some((key) =>
          event.affectsConfiguration(`stemlink.${key}`),
        )
      )
        scheduleDiscovery();
      else if (event.affectsConfiguration('stemlink.enableRouterIndexes')) syncRouterIndexes();
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const pending = context.globalState.get<string>(pendingOpenKey);
      const root =
        pending &&
        vscode.workspace.workspaceFolders?.find((folder) =>
          sameUri(folder.uri, vscode.Uri.parse(pending)),
        );
      if (pending && root) {
        void (async () => {
          try {
            await queueDiscovery(root.uri);
            const vault = vaults.get(pending);
            if (vault && vscode.workspace.isTrusted) {
              if (routerIndexesEnabled(vault.paths)) await routerIndexes.initialize(vault.paths);
              if (agentInstructionsEnabled(vault.paths)) await agentInstructions.offer(vault.paths);
            }
          } finally {
            await context.globalState.update(pendingOpenKey, undefined);
          }
        })().catch(reportError);
        return;
      }
      scheduleDiscovery();
    }),
  );
  return {
    extendMarkdownIt: (markdown) =>
      extendMarkdownPreview(markdown, () => vscode.workspace.isTrusted, previewTarget),
  };
}

export function deactivate(): void {}
