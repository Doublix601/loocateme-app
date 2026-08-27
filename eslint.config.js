const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  prettierConfig,
  {
    // assets/map/src/map-app.js tourne DANS la WebView MapLibre (ES5, globals
    // navigateur), pas dans le bundle RN — il n'a pas à suivre les règles RN.
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'assets/**'],
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react-hooks/exhaustive-deps': 'warn',
      // Cosmetic, and noisy on French text (lots of apostrophes).
      'react/no-unescaped-entities': 'off',
      'react/display-name': 'warn',
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
  },
];
