import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { API, PlatformConfig } from 'homebridge';

import { createMockLogger, createMockAPI, createMockAccessory } from '../mocks/homebridge.js';
import { createKeyLightSettings } from '../fixtures/keylight.js';

vi.mock('bonjour-service', () => ({
  Bonjour: class {
    find = vi.fn(() => ({ stop: vi.fn() }));
    destroy = vi.fn();
  },
}));

vi.mock('../../src/devices/KeyLightInstance.js', () => ({
  KeyLightInstance: {
    createInstance: vi.fn(),
  },
}));

import { KeyLightsPlatform } from '../../src/platform/KeyLightsPlatform.js';
import { KeyLightInstance } from '../../src/devices/KeyLightInstance.js';
import { PLUGIN_NAME, PLATFORM_NAME } from '../../src/config/settings.js';
import type { KeyLight } from '../../src/types/index.js';

const createInstanceMock = vi.mocked(KeyLightInstance.createInstance);

/**
 * Creates a fake initialized device instance as returned by KeyLightInstance.createInstance
 */
function createFakeInstance(light: KeyLight) {
  return {
    hostname: light.hostname,
    port: light.port,
    name: light.name,
    mac: light.mac,
    serialNumber: `SN-${light.mac}`,
    info: { serialNumber: `SN-${light.mac}` },
    reachable: true,
    displayName: light.name,
    manufacturer: 'Elgato',
    model: 'Elgato Key Light',
    firmwareVersion: '1.0.3',
    settings: createKeyLightSettings(),
    options: { numberOfLights: 1, lights: [{ on: 1, brightness: 50, temperature: 200 }] },
    updateSettings: vi.fn().mockResolvedValue(undefined),
    getProperty: vi.fn().mockReturnValue(200),
    identify: vi.fn(),
    stopPolling: vi.fn(),
    updateConnectionData: vi.fn(),
    onPropertyChanged: undefined,
    onReachabilityChanged: undefined as ((reachable: boolean) => void) | undefined,
  };
}

function createPlatform(config: Partial<PlatformConfig>) {
  const log = createMockLogger();
  const api = createMockAPI();
  (api as unknown as { platformAccessory: unknown }).platformAccessory = function (name: string, uuid: string) {
    return createMockAccessory(uuid, name);
  };

  const platform = new KeyLightsPlatform(
    log,
    { platform: PLATFORM_NAME, name: 'Elgato Key Lights', ...config } as PlatformConfig,
    api as API,
  );

  const didFinishLaunching = vi.mocked(api.on).mock.calls
    .find(([event]) => event === 'didFinishLaunching')?.[1] as () => void;

  return { platform, log, api, didFinishLaunching };
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('KeyLightsPlatform', () => {
  beforeEach(() => {
    createInstanceMock.mockReset();
    createInstanceMock.mockImplementation(async (light) =>
      createFakeInstance(light) as unknown as Awaited<ReturnType<typeof KeyLightInstance.createInstance>>,
    );
  });

  describe('plugin identity', () => {
    it('PLUGIN_NAME matches the npm package name', () => {
      const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
      expect(PLUGIN_NAME).toBe(pkg.name);
    });
  });

  describe('configured device registration', () => {
    it('initializes configured devices using their IP address', async () => {
      const { api, didFinishLaunching } = createPlatform({
        devices: [{
          name: 'Key Light Office',
          mac: 'aa:bb:cc:dd:ee:ff',
          host: 'elgato-key-light.local',
          ip: '192.168.1.50',
          port: 9123,
          enabled: true,
        }],
      });

      didFinishLaunching();
      await flushPromises();

      expect(createInstanceMock).toHaveBeenCalledTimes(1);
      const light = createInstanceMock.mock.calls[0][0];
      expect(light.hostname).toBe('192.168.1.50');
      expect(light.mac).toBe('AA:BB:CC:DD:EE:FF');
      expect(api.registerPlatformAccessories).toHaveBeenCalledWith(
        PLUGIN_NAME,
        PLATFORM_NAME,
        expect.arrayContaining([expect.objectContaining({ displayName: 'Key Light Office' })]),
      );
    });

    it('falls back to the configured hostname when no IP is set', async () => {
      const { didFinishLaunching } = createPlatform({
        devices: [{ name: 'Light', mac: 'AA:BB:CC:DD:EE:01', host: 'elgato.local' }],
      });

      didFinishLaunching();
      await flushPromises();

      expect(createInstanceMock).toHaveBeenCalledTimes(1);
      const light = createInstanceMock.mock.calls[0][0];
      expect(light.hostname).toBe('elgato.local');
      expect(light.port).toBe(9123);
    });

    it('skips devices with enabled set to false', async () => {
      const { api, didFinishLaunching } = createPlatform({
        devices: [{ name: 'Disabled', mac: 'AA:BB:CC:DD:EE:02', ip: '192.168.1.51', enabled: false }],
      });

      didFinishLaunching();
      await flushPromises();

      expect(createInstanceMock).not.toHaveBeenCalled();
      expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('warns and skips devices without MAC or connection info', async () => {
      const { log, didFinishLaunching } = createPlatform({
        devices: [{ name: 'Broken', mac: 'AA:BB:CC:DD:EE:03' }],
      });

      didFinishLaunching();
      await flushPromises();

      expect(createInstanceMock).not.toHaveBeenCalled();
      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping configured device'),
        expect.any(String),
      );
    });

    it('applies per-device power-on settings, converting Kelvin to mirek', async () => {
      const { didFinishLaunching } = createPlatform({
        devices: [{
          name: 'Custom',
          mac: 'AA:BB:CC:DD:EE:04',
          ip: '192.168.1.52',
          powerOnBehavior: 2,
          powerOnBrightness: 80,
          powerOnTemperature: 5000,
        }],
      });

      didFinishLaunching();
      await flushPromises();

      expect(createInstanceMock).toHaveBeenCalledTimes(1);
      const instance = await createInstanceMock.mock.results[0].value;
      expect(instance.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
        powerOnBehavior: 2,
        powerOnBrightness: 80,
        powerOnTemperature: 200,
      }));
    });

    it('clamps a 2900K power-on temperature to the range the light accepts', async () => {
      const { didFinishLaunching } = createPlatform({
        powerOnTemperature: 2900,
        devices: [{ name: 'Warm', mac: 'AA:BB:CC:DD:EE:05', ip: '192.168.1.53' }],
      });

      didFinishLaunching();
      await flushPromises();

      const instance = await createInstanceMock.mock.results[0].value;
      // 1e6 / 2900 = 345 mirek, one above the device maximum
      expect(instance.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ powerOnTemperature: 344 }));
    });

    it('ignores an empty displayName written by the config UI', async () => {
      const { api, log, didFinishLaunching } = createPlatform({
        devices: [{
          name: 'Elgato Key Light F820',
          mac: '3C:6A:9D:18:F2:35',
          ip: '192.168.1.60',
          port: 9123,
          displayName: '',
          powerOnBehavior: 0,
          enabled: true,
        }],
      });

      didFinishLaunching();
      await flushPromises();

      expect(log.error).not.toHaveBeenCalled();
      expect(api.registerPlatformAccessories).toHaveBeenCalledWith(
        PLUGIN_NAME,
        PLATFORM_NAME,
        expect.arrayContaining([expect.objectContaining({ displayName: 'Elgato Key Light F820' })]),
      );
    });

    it('uses a configured displayName for the accessory', async () => {
      const { api, didFinishLaunching } = createPlatform({
        devices: [{
          name: 'Elgato Key Light F820',
          mac: '3C:6A:9D:18:F2:35',
          ip: '192.168.1.60',
          displayName: 'Studio Light',
        }],
      });

      didFinishLaunching();
      await flushPromises();

      expect(api.registerPlatformAccessories).toHaveBeenCalledWith(
        PLUGIN_NAME,
        PLATFORM_NAME,
        expect.arrayContaining([expect.objectContaining({ displayName: 'Studio Light' })]),
      );
    });

    it('logs initialization failures at error level with the reason', async () => {
      createInstanceMock.mockRejectedValue(new Error('connect ETIMEDOUT 192.168.1.53:9123'));
      const { log, api, didFinishLaunching } = createPlatform({
        devices: [{ name: 'Unreachable', mac: 'AA:BB:CC:DD:EE:05', ip: '192.168.1.53' }],
      });

      didFinishLaunching();
      await flushPromises();

      expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('Unreachable'),
        expect.stringContaining('ETIMEDOUT'),
      );
    });
  });

  describe('mDNS discovery', () => {
    function discover(platform: KeyLightsPlatform, mac: string, name = 'Elgato Key Light F820') {
      (platform as unknown as {
        handleDiscoveredService: (service: unknown) => void;
      }).handleDiscoveredService({
        name,
        host: 'elgato-key-light-f820.local',
        port: 9123,
        addresses: ['192.168.1.60'],
        txt: { id: mac },
      });
    }

    it('initializes newly discovered devices', async () => {
      const { platform, api } = createPlatform({});

      discover(platform, '3C:6A:9D:18:F2:35');
      await flushPromises();

      expect(createInstanceMock).toHaveBeenCalledTimes(1);
      expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
    });

    it('does not re-initialize a device that was registered from config', async () => {
      const { platform, didFinishLaunching } = createPlatform({
        devices: [{ name: 'Key Light', mac: '3C:6A:9D:18:F2:35', ip: '192.168.1.60' }],
      });

      didFinishLaunching();
      await flushPromises();
      discover(platform, '3c:6a:9d:18:f2:35');
      await flushPromises();

      expect(createInstanceMock).toHaveBeenCalledTimes(1);
    });

    it('retries initialization via mDNS after a failed config attempt', async () => {
      createInstanceMock.mockRejectedValueOnce(new Error('unreachable'));
      const { platform, api, didFinishLaunching } = createPlatform({
        devices: [{ name: 'Key Light', mac: '3C:6A:9D:18:F2:35', ip: '192.168.1.60' }],
      });

      didFinishLaunching();
      await flushPromises();
      expect(api.registerPlatformAccessories).not.toHaveBeenCalled();

      discover(platform, '3C:6A:9D:18:F2:35');
      await flushPromises();

      expect(createInstanceMock).toHaveBeenCalledTimes(2);
      expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
    });

    it('ignores discovered devices that are disabled in config', async () => {
      const { platform } = createPlatform({
        devices: [{ name: 'Key Light', mac: '3C:6A:9D:18:F2:35', ip: '192.168.1.60', enabled: false }],
      });

      discover(platform, '3C:6A:9D:18:F2:35');
      await flushPromises();

      expect(createInstanceMock).not.toHaveBeenCalled();
    });

    it('treats differently formatted MACs from config and mDNS as the same device', async () => {
      const { platform, api, didFinishLaunching } = createPlatform({
        devices: [{ name: 'Key Light', mac: '3c-6a-9d-18-f2-35', ip: '192.168.1.60' }],
      });

      didFinishLaunching();
      await flushPromises();
      discover(platform, '3C:6A:9D:18:F2:35');
      await flushPromises();

      expect(createInstanceMock).toHaveBeenCalledTimes(1);
      expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
      expect(platform.catalog.size).toBe(1);
    });

    it('updates the connection data of an initialized device on rediscovery', async () => {
      const { platform } = createPlatform({});

      discover(platform, '3C:6A:9D:18:F2:35');
      await flushPromises();
      discover(platform, '3C:6A:9D:18:F2:35');

      const instance = platform.catalog.getInstance('3C:6A:9D:18:F2:35');
      expect(instance?.updateConnectionData).toHaveBeenCalledTimes(1);
    });

    it('keeps the catalog state in sync with the light reachability', async () => {
      const { platform } = createPlatform({});

      discover(platform, '3C:6A:9D:18:F2:35');
      await flushPromises();
      const instance = platform.catalog.getInstance('3C:6A:9D:18:F2:35') as unknown as {
        onReachabilityChanged: (reachable: boolean) => void;
      };

      instance.onReachabilityChanged(false);
      expect(platform.catalog.get('3C:6A:9D:18:F2:35')?.state).toBe('offline');

      instance.onReachabilityChanged(true);
      expect(platform.catalog.get('3C:6A:9D:18:F2:35')?.state).toBe('online');
    });

    it('ignores services without a device id', async () => {
      const { platform, log } = createPlatform({});

      discover(platform, '');
      await flushPromises();

      expect(createInstanceMock).not.toHaveBeenCalled();
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('without a device id'), expect.anything());
    });

    it('prefers an IPv4 address when useIP is enabled', async () => {
      const { platform } = createPlatform({ useIP: true });

      (platform as unknown as { handleDiscoveredService: (service: unknown) => void }).handleDiscoveredService({
        name: 'Key Light',
        host: 'elgato.local',
        port: 9123,
        addresses: ['fe80::1', '192.168.1.60'],
        txt: { id: '3C:6A:9D:18:F2:35' },
      });

      expect(createInstanceMock.mock.calls[0][0].hostname).toBe('192.168.1.60');
    });
  });

  describe('accessory lifecycle', () => {
    it('does not register the same accessory twice when a device is configured again', async () => {
      const { platform, api } = createPlatform({});
      const configureDevice = (platform as unknown as { configureDevice: (light: unknown) => void }).configureDevice.bind(platform);
      const instance = createFakeInstance({ hostname: '192.168.1.60', port: 9123, name: 'Key Light', mac: '3C:6A:9D:18:F2:35' });

      configureDevice(instance);
      configureDevice(instance);

      expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
      expect(api.updatePlatformAccessories).toHaveBeenCalledTimes(1);
    });

    it('falls back to the MAC for the accessory UUID when the serial number is missing', async () => {
      const { platform, api } = createPlatform({});
      const configureDevice = (platform as unknown as { configureDevice: (light: unknown) => void }).configureDevice.bind(platform);
      const instance = { ...createFakeInstance({ hostname: '192.168.1.60', port: 9123, name: 'Key Light', mac: '3C:6A:9D:18:F2:35' }), info: {} };

      configureDevice(instance);

      expect(api.hap.uuid.generate).toHaveBeenCalledWith('3C:6A:9D:18:F2:35');
    });

    it('unregisters cached accessories of devices disabled in config', () => {
      const { platform, api, didFinishLaunching } = createPlatform({
        devices: [{ name: 'Key Light', mac: '3c:6a:9d:18:f2:35', ip: '192.168.1.60', enabled: false }],
      });
      const disabled = createMockAccessory('uuid-disabled', 'Disabled Light');
      disabled.context.device = { mac: '3C:6A:9D:18:F2:35' };
      const active = createMockAccessory('uuid-active', 'Active Light');
      active.context.device = { mac: 'AA:BB:CC:DD:EE:FF' };
      platform.configureAccessory(disabled);
      platform.configureAccessory(active);

      didFinishLaunching();

      expect(api.unregisterPlatformAccessories).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, [disabled]);
      expect(platform.accessories).toEqual([active]);
    });
  });
});
