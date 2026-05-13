import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testRegex: '\\.test\\.ts$',
  moduleFileExtensions: ['ts', 'js'],
};
export default config;
