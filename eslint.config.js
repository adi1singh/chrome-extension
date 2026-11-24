import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'release']),
  {
    files: ['**/*.{js,jsx,mjs}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, chrome: 'readonly' },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.mjs', 'browser-tests/**/*.mjs', 'vite.config.js', 'eslint.config.js', 'test-infomapping.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // This extension entry also exports the function that mounts the React root.
    files: ['src/autofill/indeed-buttons.jsx'],
    rules: { 'react-refresh/only-export-components': ['error', { allowExportNames: ['setupIndeedJobGenButtons'] }] },
  },
])
