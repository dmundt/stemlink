import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.vscode-test/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['src/vault.ts'], rules: { 'no-control-regex': 'off' } },
);
