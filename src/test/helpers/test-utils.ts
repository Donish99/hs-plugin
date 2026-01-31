/**
 * Test utilities and helper functions
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

/**
 * Creates a testing module with common test configuration
 */
export async function createTestingModule(
  imports: any[] = [],
  providers: any[] = [],
  controllers: any[] = [],
): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env.test',
      }),
      ...imports,
    ],
    providers,
    controllers,
  }).compile();
}

/**
 * Generates a random string for test data
 */
export function generateRandomString(length: number = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generates a random email address for tests
 */
export function generateRandomEmail(): string {
  return `test-${generateRandomString(8)}@example.com`;
}

/**
 * Waits for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a mock date for testing time-sensitive operations
 */
export function mockDate(isoString: string): jest.SpyInstance {
  const mockDate = new Date(isoString);
  return jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
}

/**
 * Resets all mocks and timers
 */
export function resetMocks(): void {
  jest.clearAllMocks();
  jest.resetAllMocks();
  jest.restoreAllMocks();
}

/**
 * Creates a deep copy of an object (for test isolation)
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Asserts that an async function throws a specific error
 */
export async function expectToThrow(
  fn: () => Promise<unknown>,
  errorType?: new (...args: any[]) => Error,
  errorMessage?: string | RegExp,
): Promise<void> {
  let thrownError: Error | undefined;

  try {
    await fn();
  } catch (error) {
    thrownError = error as Error;
  }

  expect(thrownError).toBeDefined();

  if (errorType) {
    expect(thrownError).toBeInstanceOf(errorType);
  }

  if (errorMessage) {
    if (typeof errorMessage === 'string') {
      expect(thrownError?.message).toBe(errorMessage);
    } else {
      expect(thrownError?.message).toMatch(errorMessage);
    }
  }
}

/**
 * Creates mock environment variables for testing
 */
export function mockEnv(vars: Record<string, string>): () => void {
  const originalEnv = { ...process.env };

  Object.entries(vars).forEach(([key, value]) => {
    process.env[key] = value;
  });

  return () => {
    Object.keys(vars).forEach((key) => {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    });
  };
}
