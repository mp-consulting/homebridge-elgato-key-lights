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

/** Default polling rate in milliseconds */
export const DEFAULT_POLLING_RATE_MS = 1000;

/** Kelvin to mirek conversion factor */
export const KELVIN_TO_MIREK_FACTOR = 1000000;
