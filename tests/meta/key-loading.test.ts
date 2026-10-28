// Key loading: local ~/.hermes/.env stays primary; env var is the CI fallback.
// fs is stubbed to simulate a CI runner with no local env file.
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: () => {
      throw new Error('no local env file');
    },
  };
});

afterEach(() => {
  delete process.env.BASETEN_API_KEY;
  vi.resetModules();
});

describe('baseten key loading', () => {
  test('falls back to BASETEN_API_KEY env var when no local file exists', async () => {
    process.env.BASETEN_API_KEY = 'ci-test-key';
    const { basetenKey } = await import('../../packages/meta/src/baseten.js');
    expect(basetenKey()).toBe('ci-test-key');
  });

  test('throws when neither file nor env var provides a key', async () => {
    const { basetenKey } = await import('../../packages/meta/src/baseten.js');
    expect(() => basetenKey()).toThrow('BASETEN_API_KEY missing');
  });
});
