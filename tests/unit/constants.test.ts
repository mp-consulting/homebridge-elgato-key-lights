import { describe, it, expect } from 'vitest';
import {
  BONJOUR_SERVICE_TYPE,
  API_PATHS,
  COLOR_TEMPERATURE,
  DEFAULT_POLLING_RATE_MS,
  KELVIN_TO_MIREK_FACTOR,
} from '../../src/config/constants.js';

describe('constants', () => {
  describe('BONJOUR_SERVICE_TYPE', () => {
    it('should be "elg" for Elgato devices', () => {
      expect(BONJOUR_SERVICE_TYPE).toBe('elg');
    });
  });

  describe('API_PATHS', () => {
    it('should have correct base path', () => {
      expect(API_PATHS.BASE).toBe('/elgato/');
    });

    it('should have correct accessory-info path', () => {
      expect(API_PATHS.ACCESSORY_INFO).toBe('accessory-info');
    });

    it('should have correct lights path', () => {
      expect(API_PATHS.LIGHTS).toBe('lights');
    });

    it('should have correct settings path', () => {
      expect(API_PATHS.SETTINGS).toBe('lights/settings');
    });

    it('should have correct identify path', () => {
      expect(API_PATHS.IDENTIFY).toBe('identify');
    });
  });

  describe('COLOR_TEMPERATURE', () => {
    it('should have minimum mirek value of 143', () => {
      expect(COLOR_TEMPERATURE.MIN_MIREK).toBe(143);
    });

    it('should have maximum mirek value of 344', () => {
      expect(COLOR_TEMPERATURE.MAX_MIREK).toBe(344);
    });

    it('should have min less than max', () => {
      expect(COLOR_TEMPERATURE.MIN_MIREK).toBeLessThan(COLOR_TEMPERATURE.MAX_MIREK);
    });
  });

  describe('DEFAULT_POLLING_RATE_MS', () => {
    it('should be 1000ms (1 second)', () => {
      expect(DEFAULT_POLLING_RATE_MS).toBe(1000);
    });
  });

  describe('KELVIN_TO_MIREK_FACTOR', () => {
    it('should be 1000000 for correct conversion', () => {
      expect(KELVIN_TO_MIREK_FACTOR).toBe(1000000);
    });

    it('should allow correct Kelvin to mirek conversion', () => {
      const kelvin = 5000;
      const expectedMirek = KELVIN_TO_MIREK_FACTOR / kelvin;
      expect(expectedMirek).toBe(200);
    });
  });
});
