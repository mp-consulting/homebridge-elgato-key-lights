import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { Bonjour, Service as BonjourService, Browser } from 'bonjour-service';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { KeyLightsAccessory } from './keyLightsAccessory.js';
import { KeyLight, KeyLightInstance } from './keyLight.js';
import { DeviceCatalog } from './deviceCatalog.js';

export class KeyLightsPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  // centralized device catalog for managing all devices
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
    this.browser = this.bonjour.find({ type: 'elg' }, (remoteService: BonjourService) => {
      this.handleDiscoveredService(remoteService);
    });
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
      mac: remoteService.txt?.id as string ?? '',
    };

    if (this.catalog.has(light.mac)) {
      // Device already in catalog, update connection data
      this.log.debug('Updating connection data for accessory:', remoteService.name);
      this.catalog.updateConnectionData(light.mac, light);
      this.catalog.getAccessory(light.mac)?.updateConnectionData(light);
    } else {
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
        .catch((reason) => {
          this.log.error('Could not register accessory, skipping', remoteService.name);
          this.log.debug('Reason:', reason);
          this.catalog.markError(light.mac, String(reason));
        });
    }
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This method handles the creation of the HomeKit accessory from a KeyLightInstance
   */
  configureDevice(light: KeyLightInstance) {

    // update the device settings
    light.updateSettings({
      powerOnBehavior: this.config.powerOnBehavior ?? light.settings?.powerOnBehavior ?? 1,
      powerOnBrightness: this.config.powerOnBrightness ?? light.settings?.powerOnBrightness ?? 20,
      powerOnTemperature: this.config.powerOnTemperature
        ? Math.round(1000000 / this.config.powerOnTemperature)
        : light.settings?.powerOnTemperature
        ?? 213,
      switchOnDurationMs: this.config.switchOnDurationMs ?? light.settings?.switchOnDurationMs ?? 100,
      switchOffDurationMs: this.config.switchOffDurationMs ?? light.settings?.switchOffDurationMs ?? 300,
      colorChangeDurationMs: this.config.colorChangeDurationMs ?? light.settings?.colorChangeDurationMs ?? 100,
    });

    // generate a unique id for the accessory from the serial number
    const uuid = this.api.hap.uuid.generate(light.serialNumber);
    this.log.debug('UUID for', light.name, 'is', uuid);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the configureAccessory method above
    let accessory = this.accessories.find(accessory => accessory.UUID === uuid);

    // Extract only serializable KeyLight data for context storage (avoid circular refs from timers)
    const deviceContext: KeyLight = {
      hostname: light.hostname,
      port: light.port,
      name: light.name,
      mac: light.mac,
    };

    if (accessory) {
      // the accessory already exists
      this.log.info('Restoring existing accessory from cache:', light.name, 'as', accessory.displayName);

      // update the context with serializable data only
      accessory.context.device = deviceContext;
      this.api.updatePlatformAccessories([accessory]);

      // create the accessory handler for the restored accessory
      const handler = new KeyLightsAccessory(this, accessory, light);
      this.catalog.registerAccessory(light.mac, handler);

    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory to Homebridge:', light.name, 'as', light.displayName);

      // create a new accessory
      accessory = new this.api.platformAccessory(light.displayName, uuid);

      // store serializable device data in the context
      accessory.context.device = deviceContext;

      // create the accessory handler for the newly create accessory
      const handler = new KeyLightsAccessory(this, accessory, light);
      this.catalog.registerAccessory(light.mac, handler);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  /**
   * This method fetches the hostname or IP address to use from the found service
   */
  private getHostnameForLight(remoteService: BonjourService): string {
    if (remoteService.addresses !== undefined) {
      return this.config.useIP 
        ? remoteService.addresses[0]
        : remoteService.host;
    } else {
      return remoteService.host;
    }
  }
}
