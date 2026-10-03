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
import {
  BONJOUR_SERVICE_TYPE,
  KELVIN_TO_MIREK_FACTOR,
  DEFAULT_DEVICE_SETTINGS,
  DEFAULT_DEVICE_PORT,
  clampColorTemperature,
} from '../config/constants.js';
import { KeyLightsAccessory } from '../accessories/KeyLightsAccessory.js';
import { KeyLightInstance } from '../devices/KeyLightInstance.js';
import { DeviceCatalog } from './DeviceCatalog.js';
import { canonicalMacAddress, isIPv4Address } from '../utils/dns-resolver.js';
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
      this.removeDisabledAccessories();
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
        mac: canonicalMacAddress(device.mac),
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

    const txtId = remoteService.txt?.id;
    if (typeof txtId !== 'string' || txtId.trim() === '') {
      // Devices are keyed by MAC; without one, unrelated lights would overwrite each other
      this.log.warn('Ignoring discovered service without a device id:', remoteService.name);
      return;
    }

    const light: KeyLight = {
      hostname: this.getHostnameForLight(remoteService),
      port: remoteService.port,
      name: remoteService.name,
      mac: canonicalMacAddress(txtId),
      addresses: remoteService.addresses,
    };

    const existing = this.catalog.get(light.mac);
    if (existing) {
      if (existing.instance) {
        // Device already initialized, update connection data
        this.log.debug('Updating connection data for accessory:', remoteService.name);
        this.catalog.updateConnectionData(light.mac, light);
        existing.instance.updateConnectionData(light);
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
        instance.onReachabilityChanged = (reachable) => {
          if (reachable) {
            this.catalog.markOnline(light.mac);
          } else {
            this.catalog.markOffline(light.mac);
          }
        };
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
    // (2900K converts to 345 mirek, just outside the range the light accepts, hence the clamp)
    const configuredKelvin = deviceConfig?.powerOnTemperature ?? this.config.powerOnTemperature;
    const powerOnTemperature = configuredKelvin
      ? clampColorTemperature(Math.round(KELVIN_TO_MIREK_FACTOR / configuredKelvin))
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
    void light.updateSettings(settings);

    // Generate a unique id for the accessory from the serial number. Fall back to the MAC
    // so lights without a reported serial do not all collapse onto one 'unknown' UUID
    const uuid = this.api.hap.uuid.generate(light.info?.serialNumber || light.mac);
    this.log.debug('UUID for', light.name, 'is', uuid);
    const customName = customDisplayName ?? light.displayName;

    // Extract only serializable KeyLight data for context storage (avoid circular refs from timers)
    const deviceContext: KeyLight = {
      hostname: light.hostname,
      port: light.port,
      name: light.name,
      mac: light.mac,
    };

    // See if an accessory with the same uuid has already been registered, either restored
    // from the cache in configureAccessory or created earlier in this session
    let accessory = this.accessories.find((acc) => acc.UUID === uuid);

    if (accessory) {
      this.log.info('Restoring existing accessory from cache:', light.name, 'as', customName);

      // Update accessory display name if custom name is configured
      if (customDisplayName) {
        accessory.displayName = customName;
      }
      accessory.context.device = deviceContext;
      this.api.updatePlatformAccessories([accessory]);
    } else {
      this.log.info('Adding new accessory to Homebridge:', light.name, 'as', customName);

      accessory = new this.api.platformAccessory(customName, uuid);
      accessory.context.device = deviceContext;
      this.accessories.push(accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    const handler = new KeyLightsAccessory(this, accessory, light, customName);
    this.catalog.registerAccessory(light.mac, handler);
  }

  /**
   * Unregister cached accessories of devices that are disabled in config, so they
   * disappear from HomeKit instead of lingering as unresponsive tiles
   */
  private removeDisabledAccessories(): void {
    const stale = this.accessories.filter((accessory) => {
      const mac = (accessory.context.device as KeyLight | undefined)?.mac;
      return mac !== undefined && this.getDeviceConfig(mac)?.enabled === false;
    });
    if (stale.length === 0) {
      return;
    }

    for (const accessory of stale) {
      this.log.info('Removing disabled accessory from cache:', accessory.displayName);
      this.accessories.splice(this.accessories.indexOf(accessory), 1);
    }
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
  }

  /**
   * This method fetches the hostname or IP address to use from the found service
   */
  private getHostnameForLight(remoteService: BonjourService): string {
    if (this.config.useIP && remoteService.addresses?.length) {
      return remoteService.addresses.find(isIPv4Address) ?? remoteService.addresses[0];
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
    const target = canonicalMacAddress(mac);
    return devices.find((d) => typeof d.mac === 'string' && canonicalMacAddress(d.mac) === target);
  }
}
