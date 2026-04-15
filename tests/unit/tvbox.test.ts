import { describe, it, expect } from 'vitest';
import { parseTvBoxConfig } from '../../src/utils/tvbox';

describe('tvbox utils', () => {
  describe('parseTvBoxConfig', () => {
    it('should return null if no data is provided', () => {
      expect(parseTvBoxConfig(null)).toBeNull();
      expect(parseTvBoxConfig(undefined)).toBeNull();
    });

    it('should return the data if provided', () => {
      const mockData = { test: 123 };
      expect(parseTvBoxConfig(mockData)).toEqual(mockData);
    });
  });
});
