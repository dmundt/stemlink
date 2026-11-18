import { posix } from 'node:path';
import * as vscode from 'vscode';
import { stemPattern } from '../core/documents';
import { textPosition, Vault, VaultNote, VaultPaths } from '../platform/vault';

export const noteLinksToolName = 'stemlink_getNoteLinks';
const limit = 20;

function result(data: object): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(data)),
  ]);
}

function requireTrust(token: vscode.CancellationToken): void {
  if (token.isCancellationRequested) throw new vscode.CancellationError();
  if (!vscode.workspace.isTrusted)
    throw new Error('Trust this workspace before sharing its note links with Copilot.');
}

export class NoteLinksTool implements vscode.LanguageModelTool<{ stem: string; vault?: string }> {
  private readonly vaultIds = new WeakMap<Vault, { id: string; paths: VaultPaths }>();
  private nextId = 1;

  constructor(private readonly vaults: () => readonly Vault[]) {}

  private scopeFor(vault: Vault, paths = vault.paths) {
    let entry = this.vaultIds.get(vault);
    if (entry?.paths !== paths) {
      entry = { id: `vault-${this.nextId++}`, paths };
      this.vaultIds.set(vault, entry);
    }
    return {
      id: entry.id,
      workspaceFolder: vault.folder.index + 1,
      root: posix.relative(vault.folder.uri.path, paths.root.path) || '.',
    };
  }

  prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<{ stem: string; vault?: string }>,
    token: vscode.CancellationToken,
  ): vscode.PreparedToolInvocation {
    requireTrust(token);
    return {
      invocationMessage: 'Looking up Stemlink note links',
      confirmationMessages: {
        title: 'Share Stemlink note links with Copilot?',
        message:
          'Share vault identifiers, note filenames, wiki-link targets, and source locations from the live index, which can reflect unsaved edits. Note bodies and excerpts are not shared.',
      },
    };
  }

  async invoke(
    { input }: vscode.LanguageModelToolInvocationOptions<{ stem: string; vault?: string }>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    requireTrust(token);
    const stem = input?.stem;
    if (
      typeof stem !== 'string' ||
      stem.length > 255 ||
      stem.trim() !== stem ||
      !stemPattern.test(stem)
    )
      throw new Error('Provide an exact Stemlink note stem without brackets or a file extension.');
    const id = input.vault;
    if (id !== undefined && (typeof id !== 'string' || !id.trim()))
      throw new Error('Provide a vault identifier returned by Stemlink.');

    const vaults = this.vaults();
    if (id === undefined && vaults.length > 1)
      return result({
        status: 'choose_vault',
        vaults: vaults.map((vault) => this.scopeFor(vault)),
      });
    const vault =
      id === undefined
        ? vaults[0]
        : vaults.find((item) => {
            const entry = this.vaultIds.get(item);
            return entry?.id === id && entry.paths === item.paths;
          });
    if (!vault) return result({ status: 'vault_not_found' });

    const paths = vault.paths;
    const scope = this.scopeFor(vault, paths);
    try {
      await vault.ensure();
    } catch {
      requireTrust(token);
      throw new Error('Could not index the requested Stemlink vault. Refresh it and try again.');
    }
    requireTrust(token);
    const currentVaults = this.vaults();
    if (
      !currentVaults.includes(vault) ||
      vault.paths !== paths ||
      (id === undefined && currentVaults.length !== 1)
    )
      return result({ status: 'vault_changed' });

    const note = vault.get(stem);
    if (!note) return result({ status: 'note_not_found', vault: scope, stem });
    const relativePath = (source: VaultNote) =>
      posix.join(posix.relative(paths.root.path, paths.notes.path), source.name);
    const location = (source: VaultNote, offset: number) => {
      const { line, character } = textPosition(source.text, offset);
      return { path: relativePath(source), line: line + 1, column: character + 1 };
    };
    const incoming = vault.references(stem);
    const outbound = [];
    let outboundTruncated = false;
    for (const link of note.links) {
      if (!link.valid || link.stem.length > 255) continue;
      if (outbound.length === limit) {
        outboundTruncated = true;
        break;
      }
      outbound.push({
        ...location(note, link.start),
        target: link.stem,
        resolved: vault.get(link.stem) !== undefined,
      });
    }
    return result({
      status: 'match',
      vault: scope,
      note: relativePath(note),
      inbound: incoming.slice(0, limit).map(({ note, link }) => location(note, link.start)),
      outbound,
      truncated: { inbound: incoming.length > limit, outbound: outboundTruncated },
    });
  }
}
