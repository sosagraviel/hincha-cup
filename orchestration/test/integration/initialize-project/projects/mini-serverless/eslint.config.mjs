import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'build', 'coverage', '.venv', '__pycache__', '.claude-temp', '.codex-temp'] },
  {
    files: ['**/*.{ts,tsx,js}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: 2024, sourceType: 'module' } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: { '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] },
  },
);
