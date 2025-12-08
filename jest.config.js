module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/renderer/**',
    '!src/**/*.test.js'
  ],
  testMatch: ['**/tests/unit/**/*.test.js'],
  modulePathIgnorePatterns: ['/dist/', '/build/'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/']
};