import { isIP } from 'net';

/** RFC 1123 hostname: dot-separated labels of letters, digits and inner hyphens */
const HOSTNAME_REGEX = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.?$/i;

/**
 * Validate a device address sent by the config UI and build the Elgato API URL for it.
 * Rejects anything that is not a plain IP or hostname, so a crafted host such as
 * `example.com/path?` cannot redirect requests to an arbitrary URL.
 */
export function buildDeviceUrl(host, port, path) {
  if (typeof host !== 'string' || !(isIP(host) || HOSTNAME_REGEX.test(host))) {
    throw new Error('Invalid device host');
  }
  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new Error('Invalid device port');
  }
  const urlHost = isIP(host) === 6 ? `[${host}]` : host;
  return `http://${urlHost}:${portNumber}/elgato/${path}`;
}
