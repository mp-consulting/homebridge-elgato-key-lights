import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import type { Service as BonjourService, Browser } from 'bonjour-service';
import { Bonjour } from 'bonjour-service';

import { PLATFORM_NAME, PLUGIN_NAME } from '../config/settings.js';
import { BONJOUR_SERVICE_TYPE, KELVIN_TO_MIREK_FACTOR, DEFAULT_DEVICE_SETTINGS, DEFAULT_DEVICE_PORT } from '../config/constants.js';
import { KeyLightsAccessory } from '../accessories/KeyLightsAccessory.js';
import { KeyLightInstance } from '../devices/KeyLightInstance.js';
import { DeviceCatalog } from './DeviceCatalog.js';
import { isIPv4Address } from '../utils/dns-resolver.js';
import type { KeyLight, KeyLightSettings, DeviceConfig } from '../types/index.js';

/**
 * Main platform plugin for Elgato Key Lights.
 * Handles device discovery via mDNS and HomeKit accessory management.
 */
export class KeyLightsPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // This is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  // Centralized device catalog for managing all devices
  public readonly catalog: DeviceCatalog;

  private bonjour: Bonjour | null = null;
  private browser: Browser | null = null;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.catalog = new DeviceCatalog(log);

    this.log.debug('Finished initializing platform');
    this.log.debug('Configuration:', JSON.stringify(this.config));

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // We can start discovering devices on the network
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.registerConfiguredDevices();
      this.startDiscovery();
    });

    // Handle shutdown gracefully
    this.api.on('shutdown', () => {
      this.log.info('Shutting down platform');
      this.stopDiscovery();
      this.catalog.shutdown();
    });
  }

  /**
   * Start mDNS discovery for Elgato Key Lights
   */
  public startDiscovery(): void {
    this.bonjour = new Bonjour();
    this.browser = this.bonjour.find(
      { type: BONJOUR_SERVICE_TYPE },
      (remoteService: BonjourService) => {
        this.handleDiscoveredService(remoteService);
      },
    );
    this.log.info('Started mDNS discovery for Elgato devices');
  }

  /**
   * Stop mDNS discovery
   */
  public stopDiscovery(): void {
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
    if (this.bonjour) {
      this.bonjour.destroy();
      this.bonjour = null;
    }
    this.log.debug('Stopped mDNS discovery');
  }

  /**
   * Register devices from the config.json devices array.
   * This makes configured devices available even when runtime mDNS discovery
   * fails (e.g. in containers where multicast or .local resolution is unreliable).
   */
  private registerConfiguredDevices(): void {
    const devices = this.config.devices as DeviceConfig[] | undefined;
    if (!devices || !Array.isArray(devices)) {
      return;
    }

    for (const device of devices) {
      if (device.enabled === false) {
        this.log.info('Skipping disabled device:', device.name ?? device.mac);
        continue;
      }
      if (!device.mac || (!device.ip && !device.host)) {
        this.log.warn('Skipping configured device without MAC and IP/hostname:', JSON.stringify(device));
        continue;
      }

      const light: KeyLight = {
        hostname: device.ip ?? device.host!,
        port: device.port ?? DEFAULT_DEVICE_PORT,
        name: device.name ?? device.mac,
        mac: device.mac.toUpperCase(),
        addresses: device.ip ? [device.ip] : undefined,
      };

      this.log.info('Registering configured device:', light.name);
      this.initializeDevice(light);
    }
  }

  /**
   * Handle a discovered mDNS service
   */
  private handleDiscoveredService(remoteService: BonjourService): void {
    this.log.debug('Discovered accessory:', remoteService.name);

    const light: KeyLight = {
      hostname: this.getHostnameForLight(remoteService),
      port: remoteService.port,
      name: remoteService.name,
      mac: ((remoteService.txt?.id as string) ?? '').toUpperCase(),
      addresses: remoteService.addresses,
    };

    const existing = this.catalog.get(light.mac);
    if (existing) {
      if (existing.instance) {
        // Device already initialized, update connection data
        this.log.debug('Updating connection data for accessory:', remoteService.name);
        this.catalog.updateConnectionData(light.mac, light);
        this.catalog.getAccessory(light.mac)?.updateConnectionData(light);
      } else if (existing.state === 'error') {
        // A previous initialization attempt (e.g. from config) failed; retry with mDNS data
        this.log.info('Retrying initialization with discovered connection data:', remoteService.name);
        this.initializeDevice(light);
      }
      // Otherwise initialization is already in progress
      return;
    }

    // New device discovered
    this.log.info('Discovered accessory on network:', remoteService.name);
    this.initializeDevice(light);
  }

  /**
   * Initialize a device (from config or mDNS discovery) and create its accessory
   */
  private initializeDevice(light: KeyLight): void {
    if (this.getDeviceConfig(light.mac)?.enabled === false) {
      this.log.debug('Ignoring disabled device:', light.name);
      return;
    }

    if (this.catalog.has(light.mac)) {
      this.catalog.updateConnectionData(light.mac, light);
    } else {
      this.catalog.registerDiscovery(light);
    }
    this.catalog.markInitializing(light.mac);

    KeyLightInstance.createInstance(light, this.log, this.config.pollingRate)
      .then((instance) => {
        this.log.debug('Created device instance for', instance.name);
        this.catalog.registerInstance(light.mac, instance);
        // Cache the working IP so later mDNS updates never replace it with an unresolvable .local hostname
        if (isIPv4Address(instance.hostname)) {
          this.catalog.setResolvedIp(light.mac, instance.hostname);
        }
        this.configureDevice(instance);
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.log.error(`Could not register accessory ${light.name}, skipping:`, reason);
        this.catalog.markError(light.mac, reason);
      });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  public configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // Add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * Build the device settings from per-device config, global config and current device settings
   */
  private buildDeviceSettings(light: KeyLightInstance, deviceConfig?: DeviceConfig): KeyLightSettings {
    const currentSettings = light.settings;

    // Per-device temperature (Kelvin) wins over global (Kelvin); both convert to mirek
    const configuredKelvin = deviceConfig?.powerOnTemperature ?? this.config.powerOnTemperature;
    const powerOnTemperature = configuredKelvin
      ? Math.round(KELVIN_TO_MIREK_FACTOR / configuredKelvin)
      : currentSettings?.powerOnTemperature ?? DEFAULT_DEVICE_SETTINGS.POWER_ON_TEMPERATURE;

    // Per-device powerOnBehavior of 0 means "use global setting"
    const devicePowerOnBehavior = deviceConfig?.powerOnBehavior || undefined;

    return {
      powerOnBehavior: devicePowerOnBehavior
        ?? this.config.powerOnBehavior
        ?? currentSettings?.powerOnBehavior
        ?? DEFAULT_DEVICE_SETTINGS.POWER_ON_BEHAVIOR,
      powerOnBrightness: deviceConfig?.powerOnBrightness
        ?? this.config.powerOnBrightness
        ?? currentSettings?.powerOnBrightness
        ?? DEFAULT_DEVICE_SETTINGS.POWER_ON_BRIGHTNESS,
      powerOnTemperature,
      switchOnDurationMs: this.config.switchOnDurationMs
        ?? currentSettings?.switchOnDurationMs
        ?? DEFAULT_DEVICE_SETTINGS.SWITCH_ON_DURATION_MS,
      switchOffDurationMs: this.config.switchOffDurationMs
        ?? currentSettings?.switchOffDurationMs
        ?? DEFAULT_DEVICE_SETTINGS.SWITCH_OFF_DURATION_MS,
      colorChangeDurationMs: this.config.colorChangeDurationMs
        ?? currentSettings?.colorChangeDurationMs
        ?? DEFAULT_DEVICE_SETTINGS.COLOR_CHANGE_DURATION_MS,
    };
  }

  /**
   * This method handles the creation of the HomeKit accessory from a KeyLightInstance
   */
  private configureDevice(light: KeyLightInstance): void {
    // Look up custom device configuration; the config UI writes displayName as an
    // empty string when unset, which must not be used as an accessory name
    const deviceConfig = this.getDeviceConfig(light.mac);
    const customDisplayName = deviceConfig?.displayName?.trim() || undefined;

    // Update the device settings
    const settings = this.buildDeviceSettings(light, deviceConfig);
    light.updateSettings(settings);

    // Generate a unique id for the accessory from the serial number
    const uuid = this.api.hap.uuid.generate(light.serialNumber);
    this.log.debug('UUID for', light.name, 'is', uuid);
    const customName = customDisplayName ?? light.displayName;

    // See if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the configureAccessory method above
    let accessory = this.accessories.find((acc) => acc.UUID === uuid);

    // Extract only serializable KeyLight data for context storage (avoid circular refs from timers)
    const deviceContext: KeyLight = {
      hostname: light.hostname,
      port: light.port,
      name: light.name,
      mac: light.mac,
    };

    if (accessory) {
      // The accessory already exists
      this.log.info('Restoring existing accessory from cache:', light.name, 'as', customName);

      // Update accessory display name if custom name is configured
      if (customDisplayName) {
        accessory.displayName = customName;
      }

      // Update the context with serializable data only
      accessory.context.device = deviceContext;
      this.api.updatePlatformAccessories([accessory]);

      // Create the accessory handler for the restored accessory
      const handler = new KeyLightsAccessory(this, accessory, light, customName);
      this.catalog.registerAccessory(light.mac, handler);
    } else {
      // The accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory to Homebridge:', light.name, 'as', customName);

      // Create a new accessory
      accessory = new this.api.platformAccessory(customName, uuid);

      // Store serializable device data in the context
      accessory.context.device = deviceContext;

      // Create the accessory handler for the newly created accessory
      const handler = new KeyLightsAccessory(this, accessory, light, customName);
      this.catalog.registerAccessory(light.mac, handler);

      // Link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  /**
   * This method fetches the hostname or IP address to use from the found service
   */
  private getHostnameForLight(remoteService: BonjourService): string {
    if (remoteService.addresses !== undefined && this.config.useIP) {
      return remoteService.addresses[0];
    }
    return remoteService.host;
  }

  /**
   * Look up device configuration by MAC address
   */
  private getDeviceConfig(mac: string): DeviceConfig | undefined {
    const devices = this.config.devices as DeviceConfig[] | undefined;
    if (!devices || !Array.isArray(devices)) {
      return undefined;
    }
    return devices.find((d) =>
      d.mac?.toLowerCase() === mac.toLowerCase(),
    );
  }
}
