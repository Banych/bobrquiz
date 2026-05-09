import eslintConfigNext from 'eslint-config-next';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import typescriptEslintParser from '@typescript-eslint/parser';

const eslintConfig = [
  {
    ignores: [
      'node_modules/**/*',
      '.next/**/*',
      'out/**/*',
      'src/infrastructure/database/prisma/generated/**/*',
      'playwright-report/**/*',
    ],
  },
  ...eslintConfigNext,
  // Override the babel-based next/parser (incompatible with ESLint 10) with
  // @typescript-eslint/parser for all JS/TS files.
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        sourceType: 'module',
      },
    },
  },
  eslintPluginPrettierRecommended,
  eslintConfigPrettier,
  {
    settings: {
      react: { version: '18.3.1' },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'linebreak-style': ['error', 'unix'],
      'react-hooks/error-boundaries': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default eslintConfig;
