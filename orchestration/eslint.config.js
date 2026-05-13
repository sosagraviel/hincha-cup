import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        // Node.js globals
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        global: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
      },
    },
    rules: {
      // Disable problematic rules for legacy codebase
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-case-declarations': 'off',
      'preserve-caught-error': 'off',
      'no-useless-escape': 'off',
      'no-useless-assignment': 'off',
      'no-empty': 'off',
      'no-async-promise-executor': 'off',
      // Keep only essential rules
      'prefer-const': 'off', // Disabled for legacy codebase with complex assignment patterns
      'no-var': 'error',
      'no-undef': 'off', // Disable since TypeScript handles this better
    },
  },
  {
    // Fixtures are test data with their own per-language toolchains.
    // The framework's ESLint must not descend into them.
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      'coverage/**/*',
      'test/integration/initialize-project/projects/**/*',
    ],
  },
  prettierConfig, // Disable ESLint rules that conflict with Prettier
);