module.exports = {
  projects: [
    {
      displayName: 'shared',
      testMatch: ['<rootDir>/packages/shared/tests/**/*.test.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { 
        esModuleInterop: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      }] },
      moduleFileExtensions: ['ts', 'js'],
    },
    {
      displayName: 'ingestor',
      testMatch: ['<rootDir>/apps/ingestor/tests/**/*.test.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { 
        esModuleInterop: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        tsconfig: '<rootDir>/apps/ingestor/tsconfig.json',
      }] },
      moduleNameMapper: {
        '@webhook-hub/shared': '<rootDir>/packages/shared/src',
      },
    },
    {
      displayName: 'worker',
      testMatch: ['<rootDir>/apps/worker/tests/**/*.test.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { 
        esModuleInterop: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        tsconfig: '<rootDir>/apps/worker/tsconfig.json',
      }] },
      moduleNameMapper: {
        '@webhook-hub/shared': '<rootDir>/packages/shared/src',
      },
    },
  ],
};
