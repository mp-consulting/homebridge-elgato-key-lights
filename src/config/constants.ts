/**
 * Shared constants for the Elgato Key Lights plugin
 */

/** Bonjour/mDNS service type for Elgato devices */
export const BONJOUR_SERVICE_TYPE = 'elg';

/** API endpoint paths */
export const API_PATHS = {
  BASE: '/elgato/',
  ACCESSORY_INFO: 'accessory-info',
  LIGHTS: 'lights',
  SETTINGS: 'lights/settings',
  IDENTIFY: 'identify',
} as const;

/** HomeKit color temperature range in mirek (140-500 mirek = 7143K-2000K) */
export const COLOR_TEMPERATURE = {
  MIN_MIREK: 143,
  MAX_MIREK: 344,
} as const;

/**
 * Clamp a color temperature value to the valid HomeKit range
 */
export function clampColorTemperature(value: number): number {
  return Math.max(COLOR_TEMPERATURE.MIN_MIREK, Math.min(COLOR_TEMPERATURE.MAX_MIREK, value));
}

/** Default polling rate in milliseconds */
export const DEFAULT_POLLING_RATE_MS = 1000;

/** Kelvin to mirek conversion factor */
export const KELVIN_TO_MIREK_FACTOR = 1000000;

/** ARP command timeout in milliseconds */
export const ARP_TIMEOUT_MS = 5000;

/** Maximum valid IPv4 octet value */
export const MAX_IPV4_OCTET = 255;

/** Default device settings */
export const DEFAULT_DEVICE_SETTINGS = {
  /** Default power-on behavior (1 = restore last state) */
  POWER_ON_BEHAVIOR: 1,
  /** Default power-on brightness (percentage) */
  POWER_ON_BRIGHTNESS: 20,
  /** Default power-on temperature (mirek, ~4700K) */
  POWER_ON_TEMPERATURE: 213,
  /** Default switch-on duration (milliseconds) */
  SWITCH_ON_DURATION_MS: 100,
  /** Default switch-off duration (milliseconds) */
  SWITCH_OFF_DURATION_MS: 300,
  /** Default color change duration (milliseconds) */
  COLOR_CHANGE_DURATION_MS: 100,
} as const;
