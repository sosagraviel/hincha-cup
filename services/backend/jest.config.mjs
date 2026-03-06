export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.(spec|test)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: {
        customConditions: ['development']
      }
    }]
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  setupFiles: ['dotenv/config'],
  testEnvironment: 'node',
  coverageDirectory: '../coverage',
  moduleNameMapper: {
    '^@livonit/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@livonit/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '@src/(.*)$': '<rootDir>/src/$1',
    '@modules/(.*)$': '<rootDir>/src/modules/$1',
    '@config/(.*)$': '<rootDir>/src/configs/$1',
    '@libs/(.*)$': '<rootDir>/src/libs/$1'
  }
};
