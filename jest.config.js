/** @type {import('jest').Config} */
module.exports = {
  // Specs live in test/ (excluded by tsconfig.json) so they never end up in dist/.
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  // NestJS 12 ships ESM only, so specs run under jest's native ESM runtime
  // (see the `test` script, which enables --experimental-vm-modules).
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', useESM: true }],
  },
  setupFilesAfterEnv: ['<rootDir>/test/jest-esm.setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
};
