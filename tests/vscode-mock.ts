import { posix } from 'node:path';
import { vi } from 'vitest';

export class Uri {
  constructor(readonly path: string) {}

  static file(path: string): Uri {
    return new Uri(path);
  }

  static joinPath(root: Uri, ...parts: string[]): Uri {
    return new Uri(posix.join(root.path, ...parts));
  }

  toString(): string {
    return `file://${this.path}`;
  }
}

export class FileSystemError extends Error {
  constructor(readonly code: string) {
    super(code);
  }

  static FileNotFound(): FileSystemError {
    return new FileSystemError('FileNotFound');
  }
}

export const workspace = { fs: { readFile: vi.fn() } };
