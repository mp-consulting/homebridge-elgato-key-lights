import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeMacAddress, resolveHostname } from '../../src/utils/dns-resolver.js';
import * as childProcess from 'child_process';

// Mock child_process.execFile
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

/**
 * Make every ARP command resolve with the given output, or fail with the given error
 */
function mockArp(result: string | Error) {
  vi.mocked(childProcess.execFile).mockImplementation(((...args: unknown[]) => {
    const cb = args[args.length - 1] as (err: Error | null, out?: { stdout: string; stderr: string }) => void;
    if (result instanceof Error) {
      cb(result);
    } else {
      cb(null, { stdout: result, stderr: '' });
    }
    return {} as ReturnType<typeof childProcess.execFile>;
  }) as unknown as typeof childProcess.execFile);
}

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
      const stdout = `
? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
? (192.168.1.50) at 3c:6a:9d:18:f2:35 on en0 ifscope [ethernet]
? (192.168.1.100) at 11:22:33:44:55:66 on en0 ifscope [ethernet]
`;
      mockArp(stdout);

      const result = await resolveHostname(
        'elgato-key-light.local',
        '3C:6A:9D:18:F2:35',
      );
      expect(result).toBe('192.168.1.50');
    });

    it('should resolve IP from ARP table using MAC address (Linux ip neighbor format)', async () => {
      const stdout = `
192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE
192.168.1.50 dev eth0 lladdr 3c:6a:9d:18:f2:35 STALE
192.168.1.100 dev eth0 lladdr 11:22:33:44:55:66 REACHABLE
`;
      mockArp(stdout);

      const result = await resolveHostname(
        'elgato-key-light.local',
        '3C:6A:9D:18:F2:35',
      );
      expect(result).toBe('192.168.1.50');
    });

    it('should resolve IP from ARP table using MAC address (Windows format)', async () => {
      const stdout = `
Interface: 192.168.1.5 --- 0x4
  Internet Address      Physical Address      Type
  192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic
  192.168.1.50          3c-6a-9d-18-f2-35     dynamic
  192.168.1.100         11-22-33-44-55-66     dynamic
`;
      mockArp(stdout);

      const result = await resolveHostname(
        'elgato-key-light.local',
        '3C:6A:9D:18:F2:35',
      );
      expect(result).toBe('192.168.1.50');
    });

    it('should handle MAC address with different separator formats', async () => {
      const stdout = '? (192.168.1.50) at 3c:6a:9d:18:f2:35 on en0';
      mockArp(stdout);

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
      const stdout = '? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0';
      mockArp(stdout);

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
      mockArp(new Error('Command failed'));

      const result = await resolveHostname(
        'elgato-key-light.local',
        '3C:6A:9D:18:F2:35',
      );
      expect(result).toBe('elgato-key-light.local');
    });

    it('should handle ARP command timeout gracefully', async () => {
      mockArp(new Error('Command timed out'));

      const result = await resolveHostname(
        'elgato-key-light.local',
        '3C:6A:9D:18:F2:35',
        ['192.168.1.100'],
      );
      expect(result).toBe('192.168.1.100');
    });

    it('should prefer IPv4 addresses from fallback list', async () => {
      mockArp(new Error('Failed'));

      const result = await resolveHostname(
        'device.local',
        'aa:bb:cc:dd:ee:ff',
        ['fe80::1', '192.168.1.50', '10.0.0.1'],
      );
      expect(result).toBe('192.168.1.50');
    });

    it('should not short-circuit for invalid IPv4 addresses and try resolution', async () => {
      const stdout = '? (192.168.1.99) at aa:bb:cc:dd:ee:ff on en0';
      mockArp(stdout);

      // 256.1.1.1 looks like an IP but is invalid (256 > 255)
      // It should NOT be returned as-is, instead resolution should be attempted
      const result = await resolveHostname(
        '256.1.1.1',
        'aa:bb:cc:dd:ee:ff',
      );
      // Found in ARP table, returns the resolved IP
      expect(result).toBe('192.168.1.99');
    });

    it('should match macOS arp output that strips leading zeros from MAC octets', async () => {
      mockArp('? (192.168.1.77) at 3c:6a:9d:4:a:b on en0 ifscope [ethernet]');

      const result = await resolveHostname('device.local', '3C:6A:9D:04:0A:0B');
      expect(result).toBe('192.168.1.77');
    });

    it('should run ARP commands without a shell', async () => {
      mockArp('');

      await resolveHostname('device.local', 'aa:bb:cc:dd:ee:ff');

      const [file, args] = vi.mocked(childProcess.execFile).mock.calls[0];
      expect(['arp', 'ip']).toContain(file);
      expect(Array.isArray(args)).toBe(true);
    });
  });

  describe('normalizeMacAddress', () => {
    it.each([
      ['3C:6A:9D:18:F2:35', '3c6a9d18f235'],
      ['3c-6a-9d-18-f2-35', '3c6a9d18f235'],
      ['3c:6a:9d:4:a:b', '3c6a9d040a0b'],
      ['3c6a.9d18.f235', '3c6a9d18f235'],
    ])('normalizes %s to %s', (input, expected) => {
      expect(normalizeMacAddress(input)).toBe(expected);
    });
  });
});
