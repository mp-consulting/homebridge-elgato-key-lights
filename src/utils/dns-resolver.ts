import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if a string is an IPv4 address
 */
function isIPv4Address(str: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(str)) {
    return false;
  }
  const parts = str.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Normalize MAC address to lowercase without separators for comparison
 */
function normalizeMacAddress(mac: string): string {
  return mac.toLowerCase().replace(/[:\-.]/g, '');
}

/**
 * Normalize MAC addresses within a line for comparison
 */
function normalizeMacInLine(line: string): string {
  return line.replace(/[:\-.]/g, '');
}

/**
 * Get ARP commands to try based on platform
 */
function getArpCommands(): string[] {
  const platform = process.platform;

  if (platform === 'darwin') {
    return ['arp -a'];
  } else if (platform === 'linux') {
    return ['ip neighbor show', 'arp -a'];
  } else if (platform === 'win32') {
    return ['arp -a'];
  }

  return ['arp -a'];
}

/**
 * Parse ARP command output to find IP for given MAC address
 */
function parseArpOutput(output: string, targetMac: string): string | null {
  const lines = output.split('\n');

  for (const line of lines) {
    const normalizedLine = normalizeMacInLine(line.toLowerCase());

    if (normalizedLine.includes(targetMac)) {
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

  for (const cmd of commands) {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 5000 });
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
