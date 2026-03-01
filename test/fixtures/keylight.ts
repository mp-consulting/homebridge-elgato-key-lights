import type { KeyLight, KeyLightInfo, KeyLightOptions, KeyLightSettings } from '../../src/types/index.js';

/**
 * Factory for creating test KeyLight data
 */
export function createKeyLight(overrides: Partial<KeyLight> = {}): KeyLight {
  return {
    hostname: '192.168.1.100',
    port: 9123,
    name: 'Elgato Key Light ABC123',
    mac: 'AA:BB:CC:DD:EE:FF',
    ...overrides,
  };
}

/**
 * Factory for creating test KeyLightInfo data
 */
export function createKeyLightInfo(overrides: Partial<KeyLightInfo> = {}): KeyLightInfo {
  return {
    productName: 'Elgato Key Light',
    hardwareBoardType: 53,
    firmwareBuildNumber: 218,
    firmwareVersion: '1.0.3',
    serialNumber: 'BW12K1A00001',
    displayName: 'Studio Light',
    features: ['lights'],
    ...overrides,
  };
}

/**
 * Factory for creating test KeyLightOptions data
 */
export function createKeyLightOptions(overrides: Partial<KeyLightOptions> = {}): KeyLightOptions {
  return {
    numberOfLights: 1,
    lights: [{
      on: 1,
      brightness: 50,
      temperature: 200,
    }],
    ...overrides,
  };
}

/**
 * Factory for creating test KeyLightSettings data
 */
export function createKeyLightSettings(overrides: Partial<KeyLightSettings> = {}): KeyLightSettings {
  return {
    powerOnBehavior: 1,
    powerOnBrightness: 20,
    powerOnTemperature: 213,
    switchOnDurationMs: 300,
    switchOffDurationMs: 300,
    colorChangeDurationMs: 100,
    ...overrides,
  };
}

/**
 * Creates mock API responses for a KeyLight device
 */
export function createMockApiResponses() {
  return {
    info: createKeyLightInfo(),
    options: createKeyLightOptions(),
    settings: createKeyLightSettings(),
  };
}
