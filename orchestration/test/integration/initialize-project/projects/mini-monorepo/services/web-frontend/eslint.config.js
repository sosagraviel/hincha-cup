// JS-style ESLint config (gira ships both .mjs and .js variants — exercises both).
import root from '../../eslint.config.mjs';

export default [
  ...root,
  {
    files: ['**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
];
