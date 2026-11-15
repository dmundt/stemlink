import * as vscode from "vscode";
import { VaultPaths, pathsFor, reportError, sameUri, validFolderName } from "./vault";

const markerName = ".stemlink.json";

export async function readVaultMarker(root: vscode.Uri): Promise<VaultPaths | undefined> {
  const marker = vscode.Uri.joinPath(root, markerName);
  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(marker);
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return undefined;
    throw new Error(`Cannot read ${marker.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    throw new Error(`Invalid ${marker.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !("version" in data) || data.version !== 1 ||
      !("inbox" in data) || typeof data.inbox !== "string" ||
      !("notes" in data) || typeof data.notes !== "string" ||
      !validFolderName(data.inbox) || !validFolderName(data.notes) ||
      data.inbox.toLowerCase() === data.notes.toLowerCase()) {
    throw new Error(`Invalid ${marker.path}: expected version 1 and distinct valid inbox and notes folder names.`);
  }
  return { root, inbox: vscode.Uri.joinPath(root, data.inbox), notes: vscode.Uri.joinPath(root, data.notes) };
}

export async function discoverVaults(folder: vscode.WorkspaceFolder): Promise<VaultPaths[]> {
  const entries = await vscode.workspace.fs.readDirectory(folder.uri);
  const roots = [folder.uri, ...entries.filter(([, type]) => type & vscode.FileType.Directory)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name]) => vscode.Uri.joinPath(folder.uri, name))];
  const found: VaultPaths[] = [];
  for (let i = 0; i < roots.length; i += 64) {
    const markers = await Promise.all(roots.slice(i, i + 64).map(async root => {
      try { return await readVaultMarker(root); }
      catch (error) { reportError(error); return undefined; }
    }));
    found.push(...markers.filter((marker): marker is VaultPaths => marker !== undefined));
  }
  return found;
}

export function samePaths(a: VaultPaths, b: VaultPaths): boolean {
  return sameUri(a.root, b.root) && sameUri(a.inbox, b.inbox) && sameUri(a.notes, b.notes);
}

export interface SelectionState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export async function resolveVaultPaths(folder: vscode.WorkspaceFolder, state: SelectionState): Promise<VaultPaths[]> {
  const markers = await discoverVaults(folder);
  const config = vscode.workspace.getConfiguration("stemlink", folder.uri);
  const hasSettings = ["root", "inbox", "notes"].some(key => {
    const info = config.inspect(key);
    return info?.globalValue !== undefined || info?.workspaceValue !== undefined || info?.workspaceFolderValue !== undefined;
  });
  const legacy = pathsFor(folder);
  if (!hasSettings && markers.some(marker => sameUri(marker.root, legacy.root))) return markers;
  let exists: boolean;
  try {
    exists = Boolean((await vscode.workspace.fs.stat(legacy.root)).type & vscode.FileType.Directory);
  } catch (error) {
    if (!(error instanceof vscode.FileSystemError && error.code === "FileNotFound")) throw error;
    exists = false;
  }
  if (!exists) {
    if (hasSettings) reportError(new Error(`Configured Zettelkasten folder does not exist: ${legacy.root.path}`));
    return markers;
  }
  if (markers.length && !hasSettings) {
    try {
      const [inbox, notes] = await Promise.all([
        vscode.workspace.fs.stat(legacy.inbox), vscode.workspace.fs.stat(legacy.notes),
      ]);
      if (!(inbox.type & vscode.FileType.Directory) || !(notes.type & vscode.FileType.Directory)) return markers;
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return markers;
      throw error;
    }
  }
  const sameRoot = markers.findIndex(marker => sameUri(marker.root, legacy.root));
  if (sameRoot < 0) return [...markers, legacy];
  if (samePaths(markers[sameRoot], legacy)) return markers;

  const choices = [markers[sameRoot], legacy];
  const signature = JSON.stringify(choices.map(choice =>
    [choice.root.toString(), choice.inbox.toString(), choice.notes.toString()]));
  const key = `stemlink.vaultConflict:${folder.uri.toString()}:${legacy.root.toString()}`;
  const saved = state.get<{ signature: string; selected: number }>(key);
  let selected = saved?.signature === signature && (saved.selected === 0 || saved.selected === 1)
    ? saved.selected : undefined;
  if (selected === undefined) {
    const items = choices.map((choice, index) => ({
      label: index === 0 ? ".stemlink.json" : "VS Code settings",
      detail: `Inbox: ${choice.inbox.path} | Notes: ${choice.notes.path}`,
      index,
    }));
    const choice = await vscode.window.showQuickPick(items,
      { placeHolder: `Choose folder configuration for ${legacy.root.path}` });
    if (!choice) return markers.filter((_, index) => index !== sameRoot);
    selected = choice.index;
    await state.update(key, { signature, selected });
  }
  markers[sameRoot] = choices[selected];
  return markers;
}
