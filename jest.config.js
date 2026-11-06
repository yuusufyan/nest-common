/** @type {import('jest').Config} */
module.exports = {
  // Specs live in test/ (excluded by tsconfig.json) so they never end up in dist/.
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
};
