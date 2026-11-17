import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readVaultMarker } from '../../src/workbench/discovery';
import { VaultConfigurationError } from '../../src/platform/vault';

describe('vault marker discovery with mocked VS Code filesystem', () => {
  const root = vscode.Uri.file('/vault');
  const readFile = vi.mocked(vscode.workspace.fs.readFile);

  beforeEach(() => {
    readFile.mockReset();
  });

  it('resolves marker paths including the default templates folder', async () => {
    readFile.mockResolvedValue(
      Buffer.from(JSON.stringify({ version: 1, inbox: 'captures', notes: 'permanent' })),
    );
    const paths = await readVaultMarker(root);
    expect(paths?.inbox.path).toBe('/vault/captures');
    expect(paths?.notes.path).toBe('/vault/permanent');
    expect(paths?.templates.path).toBe('/vault/templates');
    expect(readFile).toHaveBeenCalledWith(vscode.Uri.joinPath(root, '.stemlink.json'));
  });

  it('distinguishes a missing marker from a filesystem failure', async () => {
    readFile.mockRejectedValueOnce(vscode.FileSystemError.FileNotFound());
    await expect(readVaultMarker(root)).resolves.toBeUndefined();
    readFile.mockRejectedValueOnce(new Error('access denied'));
    await expect(readVaultMarker(root)).rejects.toThrow(VaultConfigurationError);
  });

  it('rejects a marker with conflicting folder names', async () => {
    readFile.mockResolvedValue(
      Buffer.from(JSON.stringify({ version: 1, inbox: 'Notes', notes: 'notes' })),
    );
    await expect(readVaultMarker(root)).rejects.toThrow(/distinct valid inbox and notes/);
  });
});
