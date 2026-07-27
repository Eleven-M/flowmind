const js = require('@eslint/js');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'flowmind-*.tgz',
      '.flowmind-codex/**',
      '.flowmind-codex-test/**',
      '.flowmind-demo/**'
    ]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        setTimeout: 'readonly',
        setImmediate: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly'
      }
    },
    rules: {
      complexity: 'off',
      'no-console': 'off',
      'no-constant-condition': 'off',
      'no-control-regex': 'off',
      'no-prototype-builtins': 'off',
      'no-unexpected-multiline': 'off',
      'no-useless-escape': 'off',
      'no-useless-assignment': 'off',
      'no-unused-vars': 'off',
      'preserve-caught-error': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  }
];
