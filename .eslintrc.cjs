module.exports = {
    env: {
        node: true,
        es2021: true,
        jest: true,
    },
    extends: ['eslint:recommended', 'plugin:jest/recommended'],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
    },
    rules: {
        'no-console': 'warn',
        'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        indent: ['error', 4, { SwitchCase: 1 }],
        'jest/no-disabled-tests': 'warn',
        'jest/no-focused-tests': 'error',
        'jest/no-identical-title': 'error',
        'max-len': [
            'warn',
            {
                code: 120,
                ignoreComments: true,
                ignoreStrings: true,
                ignoreTemplateLiterals: true,
                ignoreRegExpLiterals: true,
            },
        ],
        'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }],
        'padding-line-between-statements': [
            'error',
            { blankLine: 'always', prev: '*', next: 'return' },
            { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
            { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
        ],
        semi: ['error', 'always'],
    },
};
