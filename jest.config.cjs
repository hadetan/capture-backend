/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    collectCoverageFrom: ['src/**/*.js', '!src/**/index.js'],
    coverageDirectory: 'coverage',
    clearMocks: true,
};
