import * as vscode from "vscode";
import {
  VaultConfigurationError,
  VaultPaths,
  pathsFor,
  reportError,
  sameUri,
  validFolderName,
} from "./vault";

const markerName = ".stemlink.json";

export async function readVaultMarker(root: vscode.Uri): Promise<VaultPaths | undefined> {
  const marker = vscode.Uri.joinPath(root, markerName);
  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(marker);
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return undefined;
    throw new VaultConfigurationError(
      `Cannot read ${marker.path}: ${error instanceof Error ? error.message : String(error)}`,
      marker,
      { cause: error },
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    throw new VaultConfigurationError(
      `Invalid ${marker.path}: ${error instanceof Error ? error.message : String(error)}`,
      marker,
      { cause: error },
    );
  }
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !("version" in data) ||
    data.version !== 1 ||
    !("inbox" in data) ||
    typeof data.inbox !== "string" ||
    !("notes" in data) ||
    typeof data.notes !== "string" ||
    !validFolderName(data.inbox) ||
    !validFolderName(data.notes) ||
    data.inbox.toLowerCase() === data.notes.toLowerCase()
  ) {
    throw new VaultConfigurationError(
      `Invalid ${marker.path}: expected version 1 and distinct valid inbox and notes folder names.`,
      marker,
    );
  }
  const templates = "templates" in data ? data.templates : "templates";
  if (
    typeof templates !== "string" ||
    !validFolderName(templates) ||
    ("templates" in data &&
      [data.inbox, data.notes].some((name) => name.toLowerCase() === templates.toLowerCase()))
  ) {
    throw new VaultConfigurationError(
      `Invalid ${marker.path}: templates must be a valid folder name distinct from inbox and notes.`,
      marker,
    );
  }
  return {
    root,
    inbox: vscode.Uri.joinPath(root, data.inbox),
    notes: vscode.Uri.joinPath(root, data.notes),
    templates: vscode.Uri.joinPath(root, templates),
  };
}

export async function discoverVaults(
  folder: vscode.WorkspaceFolder,
  onError: (error: unknown) => void = reportError,
): Promise<VaultPaths[]> {
  const entries = await vscode.workspace.fs.readDirectory(folder.uri);
  const roots = [
    folder.uri,
    ...entries
      .filter(([, type]) => type & vscode.FileType.Directory)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name]) => vscode.Uri.joinPath(folder.uri, name)),
  ];
  const found: VaultPaths[] = [];
  for (let i = 0; i < roots.length; i += 64) {
    const markers = await Promise.all(
      roots.slice(i, i + 64).map(async (root) => {
        try {
          return await readVaultMarker(root);
        } catch (error) {
          onError(error);
          return undefined;
        }
      }),
    );
    found.push(...markers.filter((marker): marker is VaultPaths => marker !== undefined));
  }
  return found;
}

export function samePaths(a: VaultPaths, b: VaultPaths): boolean {
  return (
    sameUri(a.root, b.root) &&
    sameUri(a.inbox, b.inbox) &&
    sameUri(a.notes, b.notes) &&
    sameUri(a.templates, b.templates)
  );
}

export interface SelectionState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export async function resolveVaultPaths(
  folder: vscode.WorkspaceFolder,
  state: SelectionState,
  onError: (error: unknown) => void = reportError,
): Promise<VaultPaths[]> {
  const markers = await discoverVaults(folder, onError);
  const config = vscode.workspace.getConfiguration("stemlink", folder.uri);
  const explicitlyConfigured = (key: string): boolean => {
    const info = config.inspect(key);
    return (
      info?.globalValue !== undefined ||
      info?.workspaceValue !== undefined ||
      info?.workspaceFolderValue !== undefined
    );
  };
  const hasSettings = ["root", "inbox", "notes", "templates"].some(explicitlyConfigured);
  let legacy: VaultPaths;
  try {
    legacy = pathsFor(folder);
  } catch (error) {
    onError(error);
    return markers;
  }
  if (!hasSettings && markers.some((marker) => sameUri(marker.root, legacy.root))) return markers;
  let exists: boolean;
  try {
    exists = Boolean(
      (await vscode.workspace.fs.stat(legacy.root)).type & vscode.FileType.Directory,
    );
  } catch (error) {
    if (!(error instanceof vscode.FileSystemError && error.code === "FileNotFound")) {
      onError(error);
      return markers;
    }
    exists = false;
  }
  if (!exists) {
    if (hasSettings)
      onError(
        new VaultConfigurationError(
          `Configured vault folder does not exist: ${legacy.root.path}`,
          "settings",
        ),
      );
    return markers;
  }
  if (markers.length && !hasSettings) {
    try {
      const [inbox, notes] = await Promise.all([
        vscode.workspace.fs.stat(legacy.inbox),
        vscode.workspace.fs.stat(legacy.notes),
      ]);
      if (!(inbox.type & vscode.FileType.Directory) || !(notes.type & vscode.FileType.Directory))
        return markers;
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return markers;
      throw error;
    }
  }
  const sameRoot = markers.findIndex((marker) => sameUri(marker.root, legacy.root));
  if (sameRoot < 0) return [...markers, legacy];
  if (!explicitlyConfigured("templates")) legacy.templates = markers[sameRoot].templates;
  if (samePaths(markers[sameRoot], legacy)) return markers;

  const choices = [markers[sameRoot], legacy];
  const signature = JSON.stringify(
    choices.map((choice) => [
      choice.root.toString(),
      choice.inbox.toString(),
      choice.notes.toString(),
      choice.templates.toString(),
    ]),
  );
  const key = `stemlink.vaultConflict:${folder.uri.toString()}:${legacy.root.toString()}`;
  const saved = state.get<{ signature: string; selected: number }>(key);
  let selected =
    saved?.signature === signature && (saved.selected === 0 || saved.selected === 1)
      ? saved.selected
      : undefined;
  if (selected === undefined) {
    const items = choices.map((choice, index) => ({
      label: index === 0 ? ".stemlink.json" : "VS Code settings",
      detail: `Inbox: ${choice.inbox.path} | Notes: ${choice.notes.path} | Templates: ${choice.templates.path}`,
      index,
    }));
    const choice = await vscode.window.showQuickPick(items, {
      placeHolder: `Choose folder configuration for ${legacy.root.path}`,
    });
    if (!choice) return markers.filter((_, index) => index !== sameRoot);
    selected = choice.index;
    await state.update(key, { signature, selected });
  }
  markers[sameRoot] = choices[selected];
  return markers;
}
