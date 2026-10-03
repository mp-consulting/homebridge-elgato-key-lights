import { describe, it, expect } from 'vitest';

import { buildDeviceUrl } from '../../homebridge-ui/validation.js';

describe('homebridge-ui buildDeviceUrl', () => {
  it.each([
    ['192.168.1.50', 9123, 'http://192.168.1.50:9123/elgato/lights'],
    ['elgato-key-light-f820.local', '9123', 'http://elgato-key-light-f820.local:9123/elgato/lights'],
    ['fe80::1', 9123, 'http://[fe80::1]:9123/elgato/lights'],
  ])('builds a URL for %s:%s', (host, port, expected) => {
    expect(buildDeviceUrl(host, port, 'lights')).toBe(expected);
  });

  it.each([
    'example.com/admin?',
    'user@example.com',
    'host:1234',
    'a b',
    '',
    undefined,
    { toString: () => '127.0.0.1' },
  ])('rejects host %s', (host) => {
    expect(() => buildDeviceUrl(host, 9123, 'lights')).toThrow('Invalid device host');
  });

  it.each([0, 65536, 9123.5, 'abc', '9123/x', undefined])('rejects port %s', (port) => {
    expect(() => buildDeviceUrl('192.168.1.50', port, 'lights')).toThrow('Invalid device port');
  });
});
