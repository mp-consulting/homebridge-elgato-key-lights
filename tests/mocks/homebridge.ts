import { vi } from 'vitest';
import type { Logger, API, PlatformAccessory, Service, Characteristic } from 'homebridge';

/**
 * Creates a mock Homebridge Logger
 */
export function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    success: vi.fn(),
  } as unknown as Logger;
}

/**
 * Creates a mock Homebridge Service
 */
export function createMockService(): Service {
  const characteristics = new Map<string, Characteristic>();

  const mockService = {
    setCharacteristic: vi.fn().mockReturnThis(),
    getCharacteristic: vi.fn((char) => {
      if (!characteristics.has(char)) {
        characteristics.set(char, createMockCharacteristic());
      }
      return characteristics.get(char);
    }),
    updateCharacteristic: vi.fn().mockReturnThis(),
    addCharacteristic: vi.fn().mockReturnThis(),
    removeCharacteristic: vi.fn().mockReturnThis(),
  } as unknown as Service;

  return mockService;
}

/**
 * Creates a mock Homebridge Characteristic
 */
export function createMockCharacteristic(): Characteristic {
  return {
    onGet: vi.fn().mockReturnThis(),
    onSet: vi.fn().mockReturnThis(),
    updateValue: vi.fn().mockReturnThis(),
    setValue: vi.fn().mockReturnThis(),
    getValue: vi.fn(),
    setProps: vi.fn().mockReturnThis(),
  } as unknown as Characteristic;
}

/**
 * Creates a mock PlatformAccessory
 */
export function createMockAccessory(uuid: string, displayName: string): PlatformAccessory {
  const services = new Map<string, Service>();

  return {
    UUID: uuid,
    displayName,
    context: {},
    getService: vi.fn((serviceType) => services.get(serviceType)),
    addService: vi.fn((serviceType) => {
      const service = createMockService();
      services.set(serviceType, service);
      return service;
    }),
    removeService: vi.fn(),
    getServiceById: vi.fn(),
  } as unknown as PlatformAccessory;
}

/**
 * Creates a mock Homebridge API
 */
export function createMockAPI(): API {
  return {
    hap: {
      Service: {
        Lightbulb: 'Lightbulb',
        AccessoryInformation: 'AccessoryInformation',
      },
      Characteristic: {
        On: 'On',
        Brightness: 'Brightness',
        ColorTemperature: 'ColorTemperature',
        Manufacturer: 'Manufacturer',
        Model: 'Model',
        SerialNumber: 'SerialNumber',
        FirmwareRevision: 'FirmwareRevision',
        Name: 'Name',
        Identify: 'Identify',
      },
      uuid: {
        generate: vi.fn((id: string) => `uuid-${id}`),
      },
    },
    on: vi.fn(),
    registerPlatformAccessories: vi.fn(),
    unregisterPlatformAccessories: vi.fn(),
    updatePlatformAccessories: vi.fn(),
    platformAccessory: vi.fn(),
  } as unknown as API;
}
