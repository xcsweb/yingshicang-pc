import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchText, fetchData } from '../../src/utils/request';

describe('request utils', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    // @ts-ignore
    global.fetch = vi.fn();
    vi.stubEnv('DEV', 'true');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('fetchText', () => {
    it('should return mock data for mock.api', async () => {
      const result = await fetchText('http://mock.api/data');
      expect(result.success).toBe(true);
      expect(result.data).toBe('');
    });

    it('should fetch text via proxy if public proxy succeeds', async () => {
      const mockText = 'mock response text';
      // Mock for useLocalProxy branch
      // @ts-ignore
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(mockText).buffer,
      });

      const result = await fetchText('https://example.com');
      expect(result.success).toBe(true);
      expect(result.data).toBe(mockText);
    });

    it('should return error if all proxies fail', async () => {
      // @ts-ignore
      global.fetch.mockRejectedValue(new Error('Network error'));

      const result = await fetchText('https://example.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('fetchData', () => {
    it('should parse and return json data', async () => {
      const mockData = { test: 123 };
      // @ts-ignore
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(mockData)).buffer,
      });

      const result = await fetchData('https://example.com/api', { noCache: true });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
    });

    it('should return error if invalid json', async () => {
      // @ts-ignore
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode('<html><body>Not JSON</body></html>').buffer,
      });

      const result = await fetchData('https://example.com/api', { noCache: true });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON format');
    });

    it('should return mock data for mock.api', async () => {
      const result = await fetchData('http://mock.api/data', { noCache: true });
      expect(result.success).toBe(true);
      expect(result.data.sites).toBeDefined();
    });
  });
});
