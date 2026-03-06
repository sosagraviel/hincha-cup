import baseConfig from './jest.config.mjs';

export default {
  ...baseConfig,
  moduleNameMapper: {
    // Mock ESM-only keycloak package for CommonJS Jest
    '^@keycloak/keycloak-admin-client$': '<rootDir>/src/integration-tests/__mocks__/@keycloak/keycloak-admin-client/index.ts',
    // Path aliases (shared package resolved via moduleNameMapper in base config)
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@config/(.*)$': '<rootDir>/src/configs/$1',
    '^@libs/(.*)$': '<rootDir>/src/libs/$1'
  },
  setupFiles: ['dotenv/config'],
  testRegex: '.e2e-spec.ts$',
  testTimeout: 100000
};
