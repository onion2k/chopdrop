// Lint for mistakes, not style: Prettier has the look of the code. The type-aware
// rules are the point, since they catch what the compiler lets through: a promise
// dropped on the floor, a comparison that can never be true, a value used as the
// wrong type through an `any`.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // A worktree under .claude is another session's checkout of all of this, with a lint of its own. Walked into from
  // here, its files are in no tsconfig of this checkout, and every one of them is a parse error for a change nobody
  // made here.
  { ignores: ['dist', 'node_modules', '.claude/worktrees'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { project: ['./tsconfig.json', './tsconfig.node.json'], tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-constant-condition': ['error', { checkLoops: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': ['error', { allowConstantLoopConditions: true }],
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
    },
  },
  { files: ['**/*.js'], ...tseslint.configs.disableTypeChecked },
  {
    files: ['scripts/**', 'test/**', '*.config.ts', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
