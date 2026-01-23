import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveHostname } from '../../src/utils/dns-resolver.js';
import * as childProcess from 'child_process';

// Mock child_process.exec
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

describe('dns-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveHostname', () => {
    it('should return hostname as-is if it is already an IPv4 address', async () => {
      const result = await resolveHostname('192.168.1.100');
      expect(result).toBe('192.168.1.100');
    });

    it('should return hostname as-is for valid IP with different octets', async () => {
      const result = await resolveHostname('10.0.0.1');
      expect(result).toBe('10.0.0.1');
    });

    it('should resolve IP from ARP table using MAC address (macOS format)', async () => {
      const mockExec = vi.mocked(childProcess.exec);
      mockExec.mockImplementation((cmd: string, options: unknown, callback?: unknown) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === 'function') {
          // macOS arp -a output format
          const stdout = `
? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
? (192.168.1.50) at 3c:6a:9d:18:f2:35 on en0 ifscope [ethernet]
? (192.168.1.100) at 11:22:33:44:55:66 on en0 ifscope [ethernet]
`;
          cb(null, { stdout, stderr: '' });
        }
        return {} as ReturnType<typeof childProcess.exec>;
      });

      const result = await resolveHostname(
        'elgato-key-light.local',
        '3C:6A:9D:18:F2:35',
      );
      expect(result).toBe('192.168.1.50');
    });

    it('should resolve IP from ARP table using MAC address (Linux ip neighbor format)', async () => {
      const mockExec = vi.mocked(childProcess.exec);
      mockExec.mockImplementation((cmd: string, options: unknown, callback?: unknown) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === 'function') {
          // Linux ip neighbor output format
          const stdout = `
192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE
192.168.1.50 dev eth0 lladdr 3c:6a:9d:18:f2:35 STALE
192.168.1.100 dev eth0 lladdr 11:22:33:44:55:66 REACHABLE
`;
          cb(null, { stdout, stderr: '' });
        }
        return {} as ReturnType<typeof childProcess.exec>;
      });

      const result = await resolveHostname(
        'elgato-key-light.local',
        '3C:6A:9D:18:F2:35',
      );
      expect(result).toBe('192.168.1.50');
    });

    it('should resolve IP from ARP table using MAC address (Windows format)', async () => {
      const mockExec = vi.mocked(childProcess.exec);
      mockExec.mockImplementation((cmd: string, options: unknown, callback?: unknown) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === 'function') {
          // Windows arp -a output format
          const stdout = `
Interface: 192.168.1.5 --- 0x4
  Internet Address      Physical Address      Type
  192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic
  192.168.1.50          3c-6a-9d-18-f2-35     dynamic
  192.168.1.100         11-22-33-44-55-66     dynamic
`;
          cb(null, { stdout, stderr: '' });
        }
        return {} as ReturnType<typeof childProcess.exec>;
      });

      const result = await resolveHostname(
        'elgato-key-light.local',
        '3C:6A:9D:18:F2:35',
      );
      expect(result).toBe('192.168.1.50');
    });

    it('should handle MAC address with different separator formats', async () => {
      const mockExec = vi.mocked(childProcess.exec);
      mockExec.mockImplementation((cmd: string, options: unknown, callback?: unknown) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === 'function') {
          const stdout = '? (192.168.1.50) at 3c:6a:9d:18:f2:35 on en0';
          cb(null, { stdout, stderr: '' });
        }
        return {} as ReturnType<typeof childProcess.exec>;
      });

      // MAC with colons
      let result = await resolveHostname('device.local', '3c:6a:9d:18:f2:35');
      expect(result).toBe('192.168.1.50');

      // MAC with dashes
      result = await resolveHostname('device.local', '3c-6a-9d-18-f2-35');
      expect(result).toBe('192.168.1.50');

      // MAC uppercase
      result = await resolveHostname('device.local', '3C:6A:9D:18:F2:35');
      expect(result).toBe('192.168.1.50');
    });

    it('should fall back to provided addresses when ARP fails', async () => {
      const mockExec = vi.mocked(childProcess.exec);
      mockExec.mockImplementation((cmd: string, options: unknown, callback?: unknown) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === 'function') {
          // ARP table doesn't contain our MAC
          const stdout = '? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0';
          cb(null, { stdout, stderr: '' });
        }
        return {} as ReturnType<typeof childProcess.exec>;
      });

      const result = await resolveHostname(
        'elgato-key-light.local',
        '3C:6A:9D:18:F2:35',
        ['192.168.1.200', '192.168.1.201'],
      );
      expect(result).toBe('192.168.1.200');
    });

    it('should fall back to provided addresses when no MAC is provided', async () => {
      const result = await resolveHostname(
        'elgato-key-light.local',
        undefined,
        ['192.168.1.200'],
      );
      expect(result).toBe('192.168.1.200');
    });

    it('should return original hostname when all resolution methods fail', async () => {
      const mockExec = vi.mocked(childProcess.exec);
      mockExec.mockImplementation((cmd: string, options: unknown, callback?: unknown) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === 'function') {
          cb(new Error('Command failed'), { stdout: '', stderr: 'error' });
        }
        return {} as ReturnType<typeof childProcess.exec>;
      });

      const result = await resolveHostname(
        'elgato-key-light.local',
        '3C:6A:9D:18:F2:35',
      );
      expect(result).toBe('elgato-key-light.local');
    });

    it('should handle ARP command timeout gracefully', async () => {
      const mockExec = vi.mocked(childProcess.exec);
      mockExec.mockImplementation((cmd: string, options: unknown, callback?: unknown) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === 'function') {
          const error = new Error('Command timed out');
          cb(error, { stdout: '', stderr: '' });
        }
        return {} as ReturnType<typeof childProcess.exec>;
      });

      const result = await resolveHostname(
        'elgato-key-light.local',
        '3C:6A:9D:18:F2:35',
        ['192.168.1.100'],
      );
      expect(result).toBe('192.168.1.100');
    });

    it('should prefer IPv4 addresses from fallback list', async () => {
      const mockExec = vi.mocked(childProcess.exec);
      mockExec.mockImplementation((cmd: string, options: unknown, callback?: unknown) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === 'function') {
          cb(new Error('Failed'), { stdout: '', stderr: '' });
        }
        return {} as ReturnType<typeof childProcess.exec>;
      });

      const result = await resolveHostname(
        'device.local',
        'aa:bb:cc:dd:ee:ff',
        ['fe80::1', '192.168.1.50', '10.0.0.1'],
      );
      expect(result).toBe('192.168.1.50');
    });

    it('should not short-circuit for invalid IPv4 addresses and try resolution', async () => {
      const mockExec = vi.mocked(childProcess.exec);
      mockExec.mockImplementation((cmd: string, options: unknown, callback?: unknown) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === 'function') {
          // ARP returns valid IP for this "hostname"
          const stdout = '? (192.168.1.99) at aa:bb:cc:dd:ee:ff on en0';
          cb(null, { stdout, stderr: '' });
        }
        return {} as ReturnType<typeof childProcess.exec>;
      });

      // 256.1.1.1 looks like an IP but is invalid (256 > 255)
      // It should NOT be returned as-is, instead resolution should be attempted
      const result = await resolveHostname(
        '256.1.1.1',
        'aa:bb:cc:dd:ee:ff',
      );
      // Found in ARP table, returns the resolved IP
      expect(result).toBe('192.168.1.99');
    });
  });
});
