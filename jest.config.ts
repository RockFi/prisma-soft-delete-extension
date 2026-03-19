import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  globalSetup: './tests/integration/setup.ts',
  // Run all test files serially to avoid SQLite race conditions
  maxWorkers: 1,
  globals: {
    'ts-jest': {
      tsconfig: './tsconfig.test.json',
    },
  },
};
export default config;
