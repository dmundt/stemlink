import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { unitTestFiles } from './run-unit-tests.mjs';

test('selects emitted tests from current sources, not stale output', () => {
  const root = mkdtempSync(join(tmpdir(), 'stemlink-unit-runner-'));
  try {
    const sources = join(root, 'tests');
    const output = join(root, 'dist', 'tests');
    mkdirSync(sources);
    mkdirSync(output, { recursive: true });
    writeFileSync(join(sources, 'current.test.ts'), '');
    writeFileSync(join(sources, 'helper.ts'), '');
    writeFileSync(join(output, 'stale.test.js'), '');
    assert.deepEqual(unitTestFiles(sources, output), [join(output, 'current.test.js')]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an empty unit test source directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'stemlink-unit-runner-'));
  try {
    assert.throws(() => unitTestFiles(root, root), /No unit test source files found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
