import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Characteristic, PlatformAccessory, Service } from 'homebridge';

import { KeyLightsAccessory } from '../../src/accessories/KeyLightsAccessory.js';
import type { KeyLightsPlatform } from '../../src/platform/KeyLightsPlatform.js';
import type { KeyLightInstance } from '../../src/devices/KeyLightInstance.js';
import type { PropertyChangedCallback } from '../../src/types/index.js';
import { createMockAccessory, createMockAPI, createMockLogger } from '../mocks/homebridge.js';

type Handler = (value?: unknown) => unknown;

function createFakeLight(overrides: Partial<Record<string, unknown>> = {}) {
  const state = { on: 1, brightness: 50, temperature: 200 };
  const light = {
    manufacturer: 'Elgato',
    model: 'Elgato Key Light',
    serialNumber: 'BW12K1A00001',
    firmwareVersion: '1.0.3',
    displayName: 'Studio Light',
    reachable: true,
    onPropertyChanged: undefined as PropertyChangedCallback | undefined,
    getProperty: vi.fn((property: keyof typeof state) => state[property]),
    setProperty: vi.fn().mockResolvedValue(undefined),
    identify: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return light;
}

function setup(lightOverrides: Partial<Record<string, unknown>> = {}) {
  const api = createMockAPI();
  const platform = {
    api,
    log: createMockLogger(),
    Service: api.hap.Service,
    Characteristic: api.hap.Characteristic,
  } as unknown as KeyLightsPlatform;
  const accessory = createMockAccessory('uuid-1', 'Studio Light');
  const light = createFakeLight(lightOverrides);

  new KeyLightsAccessory(platform, accessory, light as unknown as KeyLightInstance);

  const service = accessory.getService('Lightbulb' as unknown as typeof Service) as Service;
  const characteristic = (name: string) => service.getCharacteristic(name as unknown as typeof Characteristic) as unknown as {
    onGet: { mock: { calls: [Handler][] } };
    onSet: { mock: { calls: [Handler][] } };
    setProps: ReturnType<typeof vi.fn>;
  };
  const getHandler = (name: string) => characteristic(name).onGet.mock.calls[0][0];
  const setHandler = (name: string) => characteristic(name).onSet.mock.calls[0][0];

  return { platform, accessory, light, service, characteristic, getHandler, setHandler };
}

describe('KeyLightsAccessory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes accessory information from the light', () => {
    const { accessory } = setup();
    const info = accessory.getService('AccessoryInformation' as unknown as typeof Service) as Service;

    expect(info.setCharacteristic).toHaveBeenCalledWith('Manufacturer', 'Elgato');
    expect(info.setCharacteristic).toHaveBeenCalledWith('SerialNumber', 'BW12K1A00001');
    expect(info.setCharacteristic).toHaveBeenCalledWith('FirmwareRevision', '1.0.3');
  });

  it('restricts color temperature to the range the light supports', () => {
    const { characteristic } = setup();

    expect(characteristic('ColorTemperature').setProps).toHaveBeenCalledWith({ validValueRanges: [143, 344] });
  });

  describe('get handlers', () => {
    it('returns the cached state as HomeKit values', () => {
      const { getHandler } = setup();

      expect(getHandler('On')()).toBe(true);
      expect(getHandler('Brightness')()).toBe(50);
      expect(getHandler('ColorTemperature')()).toBe(200);
    });

    it('reports No Response while the light is unreachable', () => {
      const { getHandler } = setup({ reachable: false });

      expect(() => getHandler('On')()).toThrow(expect.objectContaining({ hapStatus: -70402 }));
      expect(() => getHandler('Brightness')()).toThrow(expect.objectContaining({ hapStatus: -70402 }));
    });
  });

  describe('set handlers', () => {
    it('converts On to the numeric value the light expects', async () => {
      const { setHandler, light } = setup();

      await setHandler('On')(false);
      await setHandler('On')(true);

      expect(light.setProperty).toHaveBeenNthCalledWith(1, 'on', 0);
      expect(light.setProperty).toHaveBeenNthCalledWith(2, 'on', 1);
    });

    it('forwards brightness and color temperature', async () => {
      const { setHandler, light } = setup();

      await setHandler('Brightness')(75);
      await setHandler('ColorTemperature')(250);

      expect(light.setProperty).toHaveBeenCalledWith('brightness', 75);
      expect(light.setProperty).toHaveBeenCalledWith('temperature', 250);
    });

    it('raises a HAP communication failure when the light rejects a write', async () => {
      const { setHandler, light, platform } = setup();
      light.setProperty.mockRejectedValueOnce(new Error('ETIMEDOUT'));

      await expect(setHandler('Brightness')(75)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(platform.log.error).toHaveBeenCalledWith(expect.stringContaining('failed'));
    });
  });

  describe('external changes', () => {
    it('pushes polled changes to HomeKit', () => {
      const { light, service } = setup();

      light.onPropertyChanged!('on', 0);
      light.onPropertyChanged!('brightness', 30);
      light.onPropertyChanged!('temperature', 500);

      expect(service.updateCharacteristic).toHaveBeenCalledWith('On', false);
      expect(service.updateCharacteristic).toHaveBeenCalledWith('Brightness', 30);
      // Out-of-range device values are clamped to the HomeKit range
      expect(service.updateCharacteristic).toHaveBeenCalledWith('ColorTemperature', 344);
    });
  });

  it('identifies the light when HomeKit asks', () => {
    const { accessory, light } = setup();
    const identifyListener = vi.mocked((accessory as PlatformAccessory).on).mock.calls
      .find(([event]) => event === 'identify')?.[1] as () => void;

    identifyListener();

    expect(light.identify).toHaveBeenCalled();
  });
});
