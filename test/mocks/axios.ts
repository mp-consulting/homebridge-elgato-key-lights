import { vi } from 'vitest';
import type { AxiosResponse } from 'axios';

/**
 * Creates a mock Axios response
 */
export function createAxiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {
      headers: {},
    },
  } as AxiosResponse<T>;
}

/**
 * Creates a mock axios module with default implementations
 */
export function createMockAxios() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    request: vi.fn(),
    defaults: {
      headers: {
        common: {},
      },
    },
  };
}

/**
 * Sets up axios mock for KeyLight API endpoints
 */
export function setupKeyLightApiMock(
  mockAxios: ReturnType<typeof createMockAxios>,
  responses: {
    info?: unknown;
    options?: unknown;
    settings?: unknown;
  },
) {
  mockAxios.get.mockImplementation((url: string) => {
    if (url.includes('accessory-info')) {
      return Promise.resolve(createAxiosResponse(responses.info));
    }
    if (url.includes('lights/settings')) {
      return Promise.resolve(createAxiosResponse(responses.settings));
    }
    if (url.includes('lights')) {
      return Promise.resolve(createAxiosResponse(responses.options));
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  mockAxios.put.mockResolvedValue(createAxiosResponse({}));
  mockAxios.post.mockResolvedValue(createAxiosResponse({}));

  return mockAxios;
}
