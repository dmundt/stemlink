import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function unitTestFiles(sourceDirectory, outputDirectory) {
  const files = readdirSync(sourceDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => join(outputDirectory, entry.name.slice(0, -3) + '.js'))
    .sort();
  if (files.length === 0) throw new Error('No unit test source files found.');
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = spawnSync(
    process.execPath,
    ['--test', ...unitTestFiles(join(root, 'tests'), join(root, 'dist', 'tests'))],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Unit tests terminated by ${result.signal}.`);
  if (result.status === null) throw new Error('Unit tests did not return an exit status.');
  process.exitCode = result.status;
}
