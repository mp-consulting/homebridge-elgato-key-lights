import { describe, it, expect } from 'vitest';
import {
  BONJOUR_SERVICE_TYPE,
  API_PATHS,
  COLOR_TEMPERATURE,
  DEFAULT_POLLING_RATE_MS,
  KELVIN_TO_MIREK_FACTOR,
  ARP_TIMEOUT_MS,
  MAX_IPV4_OCTET,
  DEFAULT_DEVICE_SETTINGS,
  clampColorTemperature,
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

  describe('ARP_TIMEOUT_MS', () => {
    it('should be 5000ms (5 seconds)', () => {
      expect(ARP_TIMEOUT_MS).toBe(5000);
    });
  });

  describe('MAX_IPV4_OCTET', () => {
    it('should be 255', () => {
      expect(MAX_IPV4_OCTET).toBe(255);
    });
  });

  describe('DEFAULT_DEVICE_SETTINGS', () => {
    it('should have correct power-on behavior default', () => {
      expect(DEFAULT_DEVICE_SETTINGS.POWER_ON_BEHAVIOR).toBe(1);
    });

    it('should have correct power-on brightness default', () => {
      expect(DEFAULT_DEVICE_SETTINGS.POWER_ON_BRIGHTNESS).toBe(20);
    });

    it('should have correct power-on temperature default', () => {
      expect(DEFAULT_DEVICE_SETTINGS.POWER_ON_TEMPERATURE).toBe(213);
    });

    it('should have correct switch-on duration default', () => {
      expect(DEFAULT_DEVICE_SETTINGS.SWITCH_ON_DURATION_MS).toBe(100);
    });

    it('should have correct switch-off duration default', () => {
      expect(DEFAULT_DEVICE_SETTINGS.SWITCH_OFF_DURATION_MS).toBe(300);
    });

    it('should have correct color change duration default', () => {
      expect(DEFAULT_DEVICE_SETTINGS.COLOR_CHANGE_DURATION_MS).toBe(100);
    });
  });

  describe('clampColorTemperature', () => {
    it('should return min when value is below range', () => {
      expect(clampColorTemperature(100)).toBe(COLOR_TEMPERATURE.MIN_MIREK);
      expect(clampColorTemperature(0)).toBe(COLOR_TEMPERATURE.MIN_MIREK);
      expect(clampColorTemperature(-50)).toBe(COLOR_TEMPERATURE.MIN_MIREK);
    });

    it('should return max when value is above range', () => {
      expect(clampColorTemperature(500)).toBe(COLOR_TEMPERATURE.MAX_MIREK);
      expect(clampColorTemperature(1000)).toBe(COLOR_TEMPERATURE.MAX_MIREK);
    });

    it('should return value unchanged when within range', () => {
      expect(clampColorTemperature(200)).toBe(200);
      expect(clampColorTemperature(143)).toBe(143);
      expect(clampColorTemperature(344)).toBe(344);
    });

    it('should clamp edge case value 140 to minimum', () => {
      // This is the actual case from the user's error
      expect(clampColorTemperature(140)).toBe(143);
    });
  });
});
