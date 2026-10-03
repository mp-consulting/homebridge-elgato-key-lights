import { execFile } from 'child_process';
import { promisify } from 'util';

import { ARP_TIMEOUT_MS, MAX_IPV4_OCTET } from '../config/constants.js';

const execFileAsync = promisify(execFile);

/** Matches a MAC address whose octets may have had leading zeros stripped (macOS `arp -a`) */
const MAC_TOKEN_REGEX = /\b[0-9a-f]{1,2}(?:[:-][0-9a-f]{1,2}){5}\b/gi;

/**
 * Check if a string is an IPv4 address
 */
export function isIPv4Address(str: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(str)) {
    return false;
  }
  const parts = str.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= MAX_IPV4_OCTET;
  });
}

/**
 * Normalize a MAC address to 12 lowercase hex digits for comparison.
 * Accepts `:`, `-` or `.` separators, with or without leading zeros per octet.
 */
export function normalizeMacAddress(mac: string): string {
  const octets = mac.toLowerCase().split(/[:-]/);
  if (octets.length === 6) {
    return octets.map(octet => octet.padStart(2, '0')).join('');
  }
  return mac.toLowerCase().replace(/[:\-.]/g, '');
}

/**
 * Format a MAC address as uppercase colon-separated octets (e.g. `3C:6A:9D:04:0A:0B`) so that
 * the same device is keyed identically whether it came from mDNS or config.json.
 * Values that are not a 6-octet MAC are only upper-cased.
 */
export function canonicalMacAddress(mac: string): string {
  const normalized = normalizeMacAddress(mac.trim());
  if (!/^[0-9a-f]{12}$/.test(normalized)) {
    return mac.trim().toUpperCase();
  }
  return normalized.toUpperCase().match(/.{2}/g)!.join(':');
}

/**
 * Get ARP commands to try based on platform, as [file, args] pairs run without a shell
 */
function getArpCommands(): Array<[string, string[]]> {
  if (process.platform === 'linux') {
    return [['ip', ['neighbor', 'show']], ['arp', ['-a']]];
  }
  return [['arp', ['-a']]];
}

/**
 * Parse ARP command output to find IP for given MAC address
 */
function parseArpOutput(output: string, targetMac: string): string | null {
  const lines = output.split('\n');

  for (const line of lines) {
    const macs = line.match(MAC_TOKEN_REGEX) ?? [];

    if (macs.some(mac => normalizeMacAddress(mac) === targetMac)) {
      // Extract IP address from the line
      // Formats:
      // macOS/Linux arp -a: "hostname (192.168.1.1) at aa:bb:cc:dd:ee:ff"
      // Linux ip neighbor: "192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff"
      // Windows arp -a: "192.168.1.1     aa-bb-cc-dd-ee-ff     dynamic"
      const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (ipMatch) {
        return ipMatch[1];
      }
    }
  }

  return null;
}

/**
 * Resolve IP address from MAC address using ARP table lookup.
 * Works on macOS, Linux, and Windows.
 */
async function resolveFromArp(mac: string): Promise<string | null> {
  const normalizedMac = normalizeMacAddress(mac);

  const commands = getArpCommands();

  for (const [file, args] of commands) {
    try {
      const { stdout } = await execFileAsync(file, args, { timeout: ARP_TIMEOUT_MS });
      const ip = parseArpOutput(stdout, normalizedMac);
      if (ip) {
        return ip;
      }
    } catch {
      // Command not available or failed, try next
    }
  }

  return null;
}

/**
 * Resolves an IP address from a MAC address using the ARP table.
 * Falls back to provided addresses if ARP lookup fails.
 *
 * @param hostname - The original hostname (returned as-is if it's already an IP)
 * @param mac - The MAC address for ARP-based lookup
 * @param fallbackAddresses - IP addresses to use if ARP lookup fails
 * @returns The resolved IP address
 */
export async function resolveHostname(
  hostname: string,
  mac?: string,
  fallbackAddresses?: string[],
): Promise<string> {
  // If the hostname is already an IP address, return it directly
  if (isIPv4Address(hostname)) {
    return hostname;
  }

  // Try ARP lookup using MAC address
  if (mac) {
    const arpResult = await resolveFromArp(mac);
    if (arpResult) {
      return arpResult;
    }
  }

  // If ARP fails, use fallback IP addresses from mDNS discovery
  if (fallbackAddresses && fallbackAddresses.length > 0) {
    const ipv4Address = fallbackAddresses.find(isIPv4Address);
    if (ipv4Address) {
      return ipv4Address;
    }
    return fallbackAddresses[0];
  }

  // Return original hostname as last resort
  return hostname;
}
