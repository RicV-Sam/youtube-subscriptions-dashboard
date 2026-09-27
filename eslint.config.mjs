import js from '@eslint/js';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['build/**', '.preview-build/**', 'node_modules/**', 'output/**', '.publication-audit/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', 'scripts/fixtures/*.js'],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^(React|[A-Z])', argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': hooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  {
    files: ['src/**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.node, ...Object.fromEntries(['test', 'expect', 'beforeAll', 'beforeEach', 'afterAll', 'afterEach', 'describe'].map(name => [name, 'readonly'])) } },
  },
  { files: ['scripts/**/*.{cjs,mjs}', '*.mjs'], languageOptions: { globals: globals.node } },
  { files: ['src/App.jsx'], languageOptions: { globals: { process: 'readonly' } } },
];
