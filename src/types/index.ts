/**
 * Shared types and interfaces for the Elgato Key Lights plugin
 */

/** Light property types */
export type LightProperty = 'brightness' | 'on' | 'temperature';

/** Callback type for property change notifications */
export type PropertyChangedCallback = (property: LightProperty, value: number) => void;

/** Represents the current state of a device in the catalog */
export type DeviceState = 'discovered' | 'initializing' | 'online' | 'offline' | 'error';

/** Basic device connection information from mDNS discovery */
export interface KeyLight {
  hostname: string;
  port: number;
  name: string;
  mac: string;
  /** IP addresses discovered via mDNS (used as fallback when hostname resolution fails) */
  addresses?: string[];
}

/** Per-device configuration from config.json */
export interface DeviceConfig {
  /** MAC address of the device */
  mac: string;
  /** Custom display name for HomeKit */
  displayName?: string;
}

/** Device power-on and transition settings */
export interface KeyLightSettings {
  powerOnBehavior: number;
  powerOnBrightness: number;
  powerOnTemperature: number;
  switchOnDurationMs: number;
  switchOffDurationMs: number;
  colorChangeDurationMs: number;
}

/** Device information from the accessory-info endpoint */
export interface KeyLightInfo {
  productName: string;
  hardwareBoardType: number;
  firmwareBuildNumber: number;
  firmwareVersion: string;
  serialNumber: string;
  displayName: string;
  features: string[];
}

/** Light state from the lights endpoint */
export interface KeyLightOptions {
  numberOfLights: number;
  lights: [{
    on: number;
    brightness: number;
    temperature: number;
  }];
}
