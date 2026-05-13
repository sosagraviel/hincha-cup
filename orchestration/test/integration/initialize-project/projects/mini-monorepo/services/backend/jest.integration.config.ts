import config from './jest.config.mjs';

export default {
  ...config,
  testRegex: '\\.integration\\.spec\\.ts$',
  testTimeout: 30_000,
  globalSetup: '<rootDir>/test/setup.ts',
};
