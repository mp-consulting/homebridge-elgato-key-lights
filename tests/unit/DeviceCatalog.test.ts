import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeviceCatalog } from '../../src/platform/DeviceCatalog.js';
import type { KeyLight } from '../../src/types/index.js';
import type { Logger } from 'homebridge';

// Create a mock logger
function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    success: vi.fn(),
  } as unknown as Logger;
}

describe('DeviceCatalog', () => {
  let catalog: DeviceCatalog;
  let mockLogger: Logger;

  const testDevice: KeyLight = {
    hostname: 'elgato-key-light.local',
    port: 9123,
    name: 'Test Key Light',
    mac: 'AA:BB:CC:DD:EE:FF',
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    catalog = new DeviceCatalog(mockLogger);
  });

  describe('resolved IP caching', () => {
    it('should store and retrieve resolved IP', () => {
      catalog.registerDiscovery(testDevice);
      catalog.setResolvedIp(testDevice.mac, '192.168.1.100');

      const resolvedIp = catalog.getResolvedIp(testDevice.mac);
      expect(resolvedIp).toBe('192.168.1.100');
    });

    it('should return undefined for devices without resolved IP', () => {
      catalog.registerDiscovery(testDevice);

      const resolvedIp = catalog.getResolvedIp(testDevice.mac);
      expect(resolvedIp).toBeUndefined();
    });

    it('should return undefined for unknown devices', () => {
      const resolvedIp = catalog.getResolvedIp('unknown-mac');
      expect(resolvedIp).toBeUndefined();
    });

    it('should use cached IP when updating connection data with .local hostname', () => {
      catalog.registerDiscovery(testDevice);
      catalog.setResolvedIp(testDevice.mac, '192.168.1.100');

      const updatedDevice: KeyLight = {
        ...testDevice,
        hostname: 'elgato-key-light.local',
      };

      catalog.updateConnectionData(testDevice.mac, updatedDevice);

      // The device's hostname should be updated to use the cached IP
      expect(updatedDevice.hostname).toBe('192.168.1.100');
    });

    it('should NOT override hostname when it is already an IP address', () => {
      catalog.registerDiscovery(testDevice);
      catalog.setResolvedIp(testDevice.mac, '192.168.1.100');

      const updatedDevice: KeyLight = {
        ...testDevice,
        hostname: '10.0.0.50', // Already an IP, not .local
      };

      catalog.updateConnectionData(testDevice.mac, updatedDevice);

      // Should keep the provided IP, not replace with cached
      expect(updatedDevice.hostname).toBe('10.0.0.50');
    });

    it('should preserve resolved IP in catalog entry', () => {
      catalog.registerDiscovery(testDevice);
      catalog.setResolvedIp(testDevice.mac, '192.168.1.100');

      const entry = catalog.get(testDevice.mac);
      expect(entry?.resolvedIp).toBe('192.168.1.100');
    });
  });

  describe('basic operations', () => {
    it('should register a discovery', () => {
      const entry = catalog.registerDiscovery(testDevice);

      expect(entry.device).toEqual(testDevice);
      expect(entry.state).toBe('discovered');
      expect(entry.instance).toBeNull();
      expect(entry.accessory).toBeNull();
    });

    it('should check if device exists', () => {
      expect(catalog.has(testDevice.mac)).toBe(false);

      catalog.registerDiscovery(testDevice);

      expect(catalog.has(testDevice.mac)).toBe(true);
    });

    it('should track device state transitions', () => {
      catalog.registerDiscovery(testDevice);
      expect(catalog.get(testDevice.mac)?.state).toBe('discovered');

      catalog.markInitializing(testDevice.mac);
      expect(catalog.get(testDevice.mac)?.state).toBe('initializing');

      catalog.markError(testDevice.mac, 'Connection failed');
      expect(catalog.get(testDevice.mac)?.state).toBe('error');
    });

    it('should update lastSeen on connection data update', () => {
      catalog.registerDiscovery(testDevice);
      const initialLastSeen = catalog.get(testDevice.mac)?.lastSeen;

      // Wait a tiny bit to ensure time difference
      const updatedDevice = { ...testDevice };
      catalog.updateConnectionData(testDevice.mac, updatedDevice);

      const newLastSeen = catalog.get(testDevice.mac)?.lastSeen;
      expect(newLastSeen?.getTime()).toBeGreaterThanOrEqual(initialLastSeen?.getTime() ?? 0);
    });

    it('should return correct stats', () => {
      catalog.registerDiscovery(testDevice);
      catalog.registerDiscovery({ ...testDevice, mac: 'BB:BB:BB:BB:BB:BB', name: 'Device 2' });

      catalog.markInitializing(testDevice.mac);

      const stats = catalog.getStats();
      expect(stats.discovered).toBe(1);
      expect(stats.initializing).toBe(1);
      expect(stats.online).toBe(0);
    });
  });
});
