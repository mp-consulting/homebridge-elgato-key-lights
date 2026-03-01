import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { KeyLightInstance } from '../../src/devices/KeyLightInstance.js';
import { createMockLogger } from '../mocks/homebridge.js';
import {
  createKeyLight,
  createKeyLightInfo,
  createKeyLightOptions,
  createKeyLightSettings,
} from '../fixtures/keylight.js';
import { createAxiosResponse } from '../mocks/axios.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('KeyLightInstance', () => {
  const mockLogger = createMockLogger();
  const mockKeyLight = createKeyLight();
  const mockInfo = createKeyLightInfo();
  const mockOptions = createKeyLightOptions();
  const mockSettings = createKeyLightSettings();

  beforeEach(() => {
    vi.useFakeTimers();

    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('accessory-info')) {
        return Promise.resolve(createAxiosResponse(mockInfo));
      }
      if (url.includes('lights/settings')) {
        return Promise.resolve(createAxiosResponse(mockSettings));
      }
      if (url.includes('lights')) {
        return Promise.resolve(createAxiosResponse(mockOptions));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    mockedAxios.put.mockResolvedValue(createAxiosResponse({}));
    mockedAxios.post.mockResolvedValue(createAxiosResponse({}));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('createInstance', () => {
    it('should create an instance and fetch device data', async () => {
      const instance = await KeyLightInstance.createInstance(mockKeyLight, mockLogger);

      expect(instance).toBeInstanceOf(KeyLightInstance);
      expect(instance.hostname).toBe(mockKeyLight.hostname);
      expect(instance.port).toBe(mockKeyLight.port);
      expect(instance.name).toBe(mockKeyLight.name);
      expect(instance.mac).toBe(mockKeyLight.mac);

      expect(mockedAxios.get).toHaveBeenCalledTimes(3);

      instance.stopPolling();
    });

    it('should throw error when device initialization fails', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        KeyLightInstance.createInstance(mockKeyLight, mockLogger),
      ).rejects.toThrow('Device initialization failed');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should use custom polling rate when provided', async () => {
      const customPollingRate = 5000;
      const instance = await KeyLightInstance.createInstance(mockKeyLight, mockLogger, customPollingRate);

      expect(instance).toBeDefined();
      instance.stopPolling();
    });
  });

  describe('device properties', () => {
    let instance: KeyLightInstance;

    beforeEach(async () => {
      instance = await KeyLightInstance.createInstance(mockKeyLight, mockLogger);
    });

    afterEach(() => {
      instance.stopPolling();
    });

    it('should return correct serialNumber', () => {
      expect(instance.serialNumber).toBe(mockInfo.serialNumber);
    });

    it('should return correct manufacturer', () => {
      expect(instance.manufacturer).toBe('Elgato');
    });

    it('should return correct model', () => {
      expect(instance.model).toBe(mockInfo.productName);
    });

    it('should return correct displayName', () => {
      expect(instance.displayName).toBe(mockInfo.displayName);
    });

    it('should fallback to name when displayName is empty', async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('accessory-info')) {
          return Promise.resolve(createAxiosResponse({ ...mockInfo, displayName: '' }));
        }
        if (url.includes('lights/settings')) {
          return Promise.resolve(createAxiosResponse(mockSettings));
        }
        if (url.includes('lights')) {
          return Promise.resolve(createAxiosResponse(mockOptions));
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const newInstance = await KeyLightInstance.createInstance(mockKeyLight, mockLogger);
      expect(newInstance.displayName).toBe(mockKeyLight.name);
      newInstance.stopPolling();
    });

    it('should return correct firmwareVersion', () => {
      expect(instance.firmwareVersion).toBe(mockInfo.firmwareVersion);
    });
  });

  describe('endpoints', () => {
    let instance: KeyLightInstance;

    beforeEach(async () => {
      instance = await KeyLightInstance.createInstance(mockKeyLight, mockLogger);
    });

    afterEach(() => {
      instance.stopPolling();
    });

    it('should construct correct infoEndpoint', () => {
      expect(instance.infoEndpoint).toBe(
        `http://${mockKeyLight.hostname}:${mockKeyLight.port}/elgato/accessory-info`,
      );
    });

    it('should construct correct lightsEndpoint', () => {
      expect(instance.lightsEndpoint).toBe(
        `http://${mockKeyLight.hostname}:${mockKeyLight.port}/elgato/lights`,
      );
    });

    it('should construct correct settingsEndpoint', () => {
      expect(instance.settingsEndpoint).toBe(
        `http://${mockKeyLight.hostname}:${mockKeyLight.port}/elgato/lights/settings`,
      );
    });

    it('should construct correct identifyEndpoint', () => {
      expect(instance.identifyEndpoint).toBe(
        `http://${mockKeyLight.hostname}:${mockKeyLight.port}/elgato/identify`,
      );
    });
  });

  describe('setProperty', () => {
    let instance: KeyLightInstance;

    beforeEach(async () => {
      instance = await KeyLightInstance.createInstance(mockKeyLight, mockLogger);
    });

    afterEach(() => {
      instance.stopPolling();
    });

    it('should send PUT request to set brightness', async () => {
      await instance.setProperty('brightness', 75);

      expect(mockedAxios.put).toHaveBeenCalledWith(
        instance.lightsEndpoint,
        { lights: [{ brightness: 75 }] },
      );
    });

    it('should send PUT request to set on state', async () => {
      await instance.setProperty('on', 1);

      expect(mockedAxios.put).toHaveBeenCalledWith(
        instance.lightsEndpoint,
        { lights: [{ on: 1 }] },
      );
    });

    it('should send PUT request to set temperature', async () => {
      await instance.setProperty('temperature', 250);

      expect(mockedAxios.put).toHaveBeenCalledWith(
        instance.lightsEndpoint,
        { lights: [{ temperature: 250 }] },
      );
    });
  });

  describe('getProperty', () => {
    let instance: KeyLightInstance;

    beforeEach(async () => {
      instance = await KeyLightInstance.createInstance(mockKeyLight, mockLogger);
    });

    afterEach(() => {
      instance.stopPolling();
    });

    it('should return brightness value', () => {
      expect(instance.getProperty('brightness')).toBe(mockOptions.lights[0].brightness);
    });

    it('should return on state', () => {
      expect(instance.getProperty('on')).toBe(mockOptions.lights[0].on);
    });

    it('should return temperature value', () => {
      expect(instance.getProperty('temperature')).toBe(mockOptions.lights[0].temperature);
    });
  });

  describe('identify', () => {
    let instance: KeyLightInstance;

    beforeEach(async () => {
      instance = await KeyLightInstance.createInstance(mockKeyLight, mockLogger);
    });

    afterEach(() => {
      instance.stopPolling();
    });

    it('should send POST request to identify endpoint', async () => {
      await instance.identify();

      expect(mockedAxios.post).toHaveBeenCalledWith(instance.identifyEndpoint);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Identify triggered'),
      );
    });

    it('should handle identify failure gracefully', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Connection failed'));

      await instance.identify();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Identify failed'),
      );
    });
  });

  describe('updateSettings', () => {
    let instance: KeyLightInstance;

    beforeEach(async () => {
      instance = await KeyLightInstance.createInstance(mockKeyLight, mockLogger);
    });

    afterEach(() => {
      instance.stopPolling();
    });

    it('should send PUT request and refresh settings', async () => {
      const newSettings = createKeyLightSettings({ powerOnBrightness: 50 });

      await instance.updateSettings(newSettings);

      expect(mockedAxios.put).toHaveBeenCalledWith(instance.settingsEndpoint, newSettings);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Updated device settings'),
      );
    });

    it('should fallback to requested settings on error', async () => {
      mockedAxios.put.mockRejectedValueOnce(new Error('Update failed'));

      const newSettings = createKeyLightSettings({ powerOnBrightness: 50 });
      await instance.updateSettings(newSettings);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update settings'),
      );
    });
  });

  describe('polling', () => {
    let instance: KeyLightInstance;

    beforeEach(async () => {
      instance = await KeyLightInstance.createInstance(mockKeyLight, mockLogger);
    });

    afterEach(() => {
      instance.stopPolling();
    });

    it('should call property changed callback when brightness changes', async () => {
      const callback = vi.fn();
      instance.onPropertyChanged = callback;

      const updatedOptions = createKeyLightOptions({
        lights: [{ on: 1, brightness: 75, temperature: 200 }],
      });

      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('lights') && !url.includes('settings')) {
          return Promise.resolve(createAxiosResponse(updatedOptions));
        }
        return Promise.resolve(createAxiosResponse({}));
      });

      await vi.advanceTimersByTimeAsync(1000);

      expect(callback).toHaveBeenCalledWith('brightness', 75);
    });

    it('should call property changed callback when on state changes', async () => {
      const callback = vi.fn();
      instance.onPropertyChanged = callback;

      const updatedOptions = createKeyLightOptions({
        lights: [{ on: 0, brightness: 50, temperature: 200 }],
      });

      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('lights') && !url.includes('settings')) {
          return Promise.resolve(createAxiosResponse(updatedOptions));
        }
        return Promise.resolve(createAxiosResponse({}));
      });

      await vi.advanceTimersByTimeAsync(1000);

      expect(callback).toHaveBeenCalledWith('on', 0);
    });

    it('should handle polling errors gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Polling of'),
      );
    });

    it('should stop polling when stopPolling is called', async () => {
      instance.stopPolling();

      const callCount = mockedAxios.get.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockedAxios.get.mock.calls.length).toBe(callCount);
    });
  });
});
