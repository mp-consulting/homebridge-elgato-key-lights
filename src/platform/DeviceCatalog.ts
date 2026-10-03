import type { Logger } from 'homebridge';

import type { KeyLightInstance } from '../devices/KeyLightInstance.js';
import type { KeyLightsAccessory } from '../accessories/KeyLightsAccessory.js';
import type { KeyLight, DeviceState } from '../types/index.js';

/**
 * Entry in the device catalog containing all device-related objects
 */
export interface DeviceCatalogEntry {
  /** Basic device connection info from discovery */
  device: KeyLight;
  /** Initialized device instance (null until initialization completes) */
  instance: KeyLightInstance | null;
  /** HomeKit accessory handler (null until accessory is configured) */
  accessory: KeyLightsAccessory | null;
  /** Current device state */
  state: DeviceState;
  /** Timestamp when device was first discovered */
  discoveredAt: Date;
  /** Timestamp of last successful communication */
  lastSeen: Date;
  /** Resolved IP address (cached for reuse when mDNS resolution fails) */
  resolvedIp?: string;
}

/**
 * Centralized registry for managing all Key Light devices.
 * Handles device lifecycle: discovery, initialization, registration, lookup, and removal.
 */
export class DeviceCatalog {
  private readonly devices: Map<string, DeviceCatalogEntry> = new Map();
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  /**
   * Check if a device exists in the catalog
   */
  public has(mac: string): boolean {
    return this.devices.has(mac);
  }

  /**
   * Get a device entry by MAC address
   */
  public get(mac: string): DeviceCatalogEntry | undefined {
    return this.devices.get(mac);
  }

  /**
   * Get the device instance for a device
   */
  public getInstance(mac: string): KeyLightInstance | undefined {
    return this.devices.get(mac)?.instance ?? undefined;
  }

  /**
   * Register a newly discovered device (before initialization)
   */
  public registerDiscovery(device: KeyLight): DeviceCatalogEntry {
    const now = new Date();
    const entry: DeviceCatalogEntry = {
      device,
      instance: null,
      accessory: null,
      state: 'discovered',
      discoveredAt: now,
      lastSeen: now,
    };
    this.devices.set(device.mac, entry);
    this.log.debug(`[Catalog] Registered discovery: ${device.name} (${device.mac})`);
    return entry;
  }

  /**
   * Update state to initializing when starting device initialization
   */
  public markInitializing(mac: string): void {
    const entry = this.devices.get(mac);
    if (entry) {
      entry.state = 'initializing';
      this.log.debug(`[Catalog] Initializing: ${entry.device.name}`);
    }
  }

  /**
   * Register a fully initialized device instance
   */
  public registerInstance(mac: string, instance: KeyLightInstance): void {
    const entry = this.devices.get(mac);
    if (entry) {
      entry.instance = instance;
      entry.state = 'online';
      entry.lastSeen = new Date();
      this.log.debug(`[Catalog] Instance registered: ${instance.displayName}`);
    }
  }

  /**
   * Register the HomeKit accessory handler for a device
   */
  public registerAccessory(mac: string, accessory: KeyLightsAccessory): void {
    const entry = this.devices.get(mac);
    if (entry) {
      entry.accessory = accessory;
      this.log.debug(`[Catalog] Accessory registered for: ${entry.device.name}`);
    }
  }

  /**
   * Update connection data when a device is rediscovered
   */
  public updateConnectionData(mac: string, device: KeyLight): void {
    const entry = this.devices.get(mac);
    if (entry) {
      // Preserve resolved IP if we have one and new hostname is .local
      if (entry.resolvedIp && device.hostname.endsWith('.local')) {
        device.hostname = entry.resolvedIp;
        this.log.debug(`[Catalog] Using cached IP ${entry.resolvedIp} for ${device.name}`);
      }
      // State is left alone: an mDNS announcement does not prove the HTTP API answers,
      // so only the instance's polling moves a device between online and offline
      entry.device = device;
      entry.lastSeen = new Date();
      this.log.debug(`[Catalog] Connection updated: ${device.name}`);
    }
  }

  /**
   * Store the resolved IP address for a device
   */
  public setResolvedIp(mac: string, ip: string): void {
    const entry = this.devices.get(mac);
    if (entry) {
      entry.resolvedIp = ip;
      this.log.debug(`[Catalog] Cached resolved IP ${ip} for ${entry.device.name}`);
    }
  }

  /**
   * Mark a device as having encountered an error during initialization
   */
  public markError(mac: string, reason?: string): void {
    const entry = this.devices.get(mac);
    if (entry) {
      entry.state = 'error';
      this.log.debug(`[Catalog] Error for ${entry.device.name}: ${reason ?? 'unknown'}`);
    }
  }

  /**
   * Mark a device as online again after it stopped responding
   */
  public markOnline(mac: string): void {
    const entry = this.devices.get(mac);
    if (entry) {
      entry.state = 'online';
      entry.lastSeen = new Date();
      this.log.debug(`[Catalog] Online: ${entry.device.name}`);
    }
  }

  /**
   * Mark a device as offline
   */
  public markOffline(mac: string): void {
    const entry = this.devices.get(mac);
    if (entry) {
      entry.state = 'offline';
      this.log.debug(`[Catalog] Offline: ${entry.device.name}`);
    }
  }

  /**
   * Get total number of devices in catalog
   */
  public get size(): number {
    return this.devices.size;
  }

  /**
   * Shutdown all devices and clear the catalog
   */
  public shutdown(): void {
    this.log.info(`[Catalog] Shutting down ${this.devices.size} device(s)`);
    for (const entry of this.devices.values()) {
      entry.instance?.stopPolling();
    }
    this.devices.clear();
  }
}
