import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import { Bonjour, Service as BonjourService, Browser } from 'bonjour-service';

import { PLATFORM_NAME, PLUGIN_NAME } from '../config/settings.js';
import { BONJOUR_SERVICE_TYPE, KELVIN_TO_MIREK_FACTOR } from '../config/constants.js';
import { KeyLightsAccessory } from '../accessories/KeyLightsAccessory.js';
import { KeyLightInstance } from '../devices/KeyLightInstance.js';
import { DeviceCatalog } from './DeviceCatalog.js';
import { KeyLight, KeyLightSettings } from '../types/index.js';

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
   * Handle a discovered mDNS service
   */
  private handleDiscoveredService(remoteService: BonjourService): void {
    this.log.debug('Discovered accessory:', remoteService.name);

    const light: KeyLight = {
      hostname: this.getHostnameForLight(remoteService),
      port: remoteService.port,
      name: remoteService.name,
      mac: (remoteService.txt?.id as string) ?? '',
    };

    if (this.catalog.has(light.mac)) {
      // Device already in catalog, update connection data
      this.log.debug('Updating connection data for accessory:', remoteService.name);
      this.catalog.updateConnectionData(light.mac, light);
      this.catalog.getAccessory(light.mac)?.updateConnectionData(light);
      return;
    }

    // New device discovered
    this.log.info('Discovered accessory on network:', remoteService.name);
    this.catalog.registerDiscovery(light);
    this.catalog.markInitializing(light.mac);

    KeyLightInstance.createInstance(light, this.log, this.config.pollingRate)
      .then((instance) => {
        this.log.debug('Created device instance for', instance.name);
        this.catalog.registerInstance(light.mac, instance);
        this.configureDevice(instance);
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.log.error('Could not register accessory, skipping', remoteService.name);
        this.log.debug('Reason:', reason);
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
   * Build the device settings from config and current device settings
   */
  private buildDeviceSettings(light: KeyLightInstance): KeyLightSettings {
    const currentSettings = light.settings;

    // Convert Kelvin to mirek if powerOnTemperature is provided in Kelvin
    const powerOnTemperature = this.config.powerOnTemperature
      ? Math.round(KELVIN_TO_MIREK_FACTOR / this.config.powerOnTemperature)
      : currentSettings?.powerOnTemperature ?? 213;

    return {
      powerOnBehavior: this.config.powerOnBehavior ?? currentSettings?.powerOnBehavior ?? 1,
      powerOnBrightness: this.config.powerOnBrightness ?? currentSettings?.powerOnBrightness ?? 20,
      powerOnTemperature,
      switchOnDurationMs: this.config.switchOnDurationMs ?? currentSettings?.switchOnDurationMs ?? 100,
      switchOffDurationMs: this.config.switchOffDurationMs ?? currentSettings?.switchOffDurationMs ?? 300,
      colorChangeDurationMs: this.config.colorChangeDurationMs ?? currentSettings?.colorChangeDurationMs ?? 100,
    };
  }

  /**
   * This method handles the creation of the HomeKit accessory from a KeyLightInstance
   */
  private configureDevice(light: KeyLightInstance): void {
    // Update the device settings
    const settings = this.buildDeviceSettings(light);
    light.updateSettings(settings);

    // Generate a unique id for the accessory from the serial number
    const uuid = this.api.hap.uuid.generate(light.serialNumber);
    this.log.debug('UUID for', light.name, 'is', uuid);

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
      this.log.info('Restoring existing accessory from cache:', light.name, 'as', accessory.displayName);

      // Update the context with serializable data only
      accessory.context.device = deviceContext;
      this.api.updatePlatformAccessories([accessory]);

      // Create the accessory handler for the restored accessory
      const handler = new KeyLightsAccessory(this, accessory, light);
      this.catalog.registerAccessory(light.mac, handler);
    } else {
      // The accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory to Homebridge:', light.name, 'as', light.displayName);

      // Create a new accessory
      accessory = new this.api.platformAccessory(light.displayName, uuid);

      // Store serializable device data in the context
      accessory.context.device = deviceContext;

      // Create the accessory handler for the newly created accessory
      const handler = new KeyLightsAccessory(this, accessory, light);
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
}
