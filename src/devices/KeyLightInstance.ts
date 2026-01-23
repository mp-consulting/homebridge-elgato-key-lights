import { CharacteristicValue, Logger } from 'homebridge';
import axios from 'axios';

import { API_PATHS, DEFAULT_POLLING_RATE_MS, clampColorTemperature } from '../config/constants.js';
import {
  KeyLight,
  KeyLightSettings,
  KeyLightInfo,
  KeyLightOptions,
  LightProperty,
  PropertyChangedCallback,
} from '../types/index.js';
import { resolveHostname } from '../utils/dns-resolver.js';

/**
 * Represents an initialized Key Light device instance.
 * Handles API communication and state polling.
 */
export class KeyLightInstance implements KeyLight {
  public hostname: string;
  public port: number;
  public readonly name: string;
  public readonly mac: string;

  public settings?: KeyLightSettings;
  public info?: KeyLightInfo;
  public options?: KeyLightOptions;

  private readonly log: Logger;
  private readonly pollingRate: number;
  private pollingIntervalId: ReturnType<typeof setInterval> | null = null;
  private propertyChangedCallback: PropertyChangedCallback = () => {};

  private constructor(keyLight: KeyLight, log: Logger, pollingRate: number) {
    this.hostname = keyLight.hostname;
    this.port = keyLight.port;
    this.name = keyLight.name;
    this.mac = keyLight.mac;
    this.log = log;
    this.pollingRate = pollingRate;
  }

  /**
   * Creates a new instance of a key light and pulls all necessary data from the light
   */
  public static async createInstance(
    data: KeyLight,
    log: Logger,
    pollingRate?: number,
  ): Promise<KeyLightInstance> {
    const instance = new KeyLightInstance(data, log, pollingRate ?? DEFAULT_POLLING_RATE_MS);

    // Try to resolve the hostname using multiple methods (DNS, ARP, fallback addresses)
    const resolvedHostname = await resolveHostname(data.hostname, data.mac, data.addresses);
    if (resolvedHostname !== data.hostname) {
      log.info(`Resolved ${data.hostname} to ${resolvedHostname} for ${data.name}`);
      instance.hostname = resolvedHostname;
    }

    try {
      const [infoResponse, optionsResponse, settingsResponse] = await Promise.all([
        axios.get<KeyLightInfo>(instance.infoEndpoint),
        axios.get<KeyLightOptions>(instance.lightsEndpoint),
        axios.get<KeyLightSettings>(instance.settingsEndpoint),
      ]);

      instance.info = infoResponse.data;
      instance.options = optionsResponse.data;
      instance.settings = settingsResponse.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error(`Failed to initialize device ${data.name}: ${message}`);
      throw new Error(`Device initialization failed: ${message}`);
    }

    instance.startPolling();
    return instance;
  }

  public get serialNumber(): string {
    return this.info?.serialNumber ?? 'unknown';
  }

  public get manufacturer(): string {
    const productName = this.info?.productName ?? 'unknown';
    const spaceIndex = productName.indexOf(' ');
    return spaceIndex > 0 ? productName.substring(0, spaceIndex) : productName;
  }

  public get model(): string {
    return this.info?.productName ?? 'unknown';
  }

  public get displayName(): string {
    const infoDisplayName = this.info?.displayName;
    if (!infoDisplayName || infoDisplayName === '') {
      return this.name;
    }
    return infoDisplayName;
  }

  public get firmwareVersion(): string {
    return this.info?.firmwareVersion ?? '1.0';
  }

  private get baseEndpoint(): string {
    return `http://${this.hostname}:${this.port}${API_PATHS.BASE}`;
  }

  public get infoEndpoint(): string {
    return `${this.baseEndpoint}${API_PATHS.ACCESSORY_INFO}`;
  }

  public get lightsEndpoint(): string {
    return `${this.baseEndpoint}${API_PATHS.LIGHTS}`;
  }

  public get settingsEndpoint(): string {
    return `${this.baseEndpoint}${API_PATHS.SETTINGS}`;
  }

  public get identifyEndpoint(): string {
    return `${this.baseEndpoint}${API_PATHS.IDENTIFY}`;
  }

  public set onPropertyChanged(callback: PropertyChangedCallback) {
    this.propertyChangedCallback = callback;
  }

  /**
   * Update device settings (power-on behavior, transition durations, etc.)
   */
  public async updateSettings(settings: KeyLightSettings): Promise<void> {
    try {
      await axios.put(this.settingsEndpoint, settings);
      const response = await axios.get<KeyLightSettings>(this.settingsEndpoint);
      this.settings = response.data;
      this.log.debug(`Updated device settings of ${this.displayName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log.error(`Failed to update settings of ${this.displayName}: ${message}`);
      // Fall back to the requested settings
      this.settings = settings;
    }
  }

  /**
   * Trigger device identification (flashes the light)
   */
  public async identify(): Promise<void> {
    try {
      await axios.post(this.identifyEndpoint);
      this.log.debug(`Identify triggered for ${this.displayName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log.debug(`Identify failed for ${this.displayName}: ${message}`);
    }
  }

  /**
   * Set a light property (on, brightness, or temperature)
   */
  public async setProperty(property: LightProperty, value: CharacteristicValue): Promise<void> {
    await axios.put(this.lightsEndpoint, { lights: [{ [property]: value }] });
  }

  /**
   * Get a light property value
   */
  public getProperty(property: LightProperty): number {
    const value = this.options?.lights[0][property] ?? 0;
    // Clamp temperature to valid HomeKit range (device may return out-of-range values)
    if (property === 'temperature') {
      return clampColorTemperature(value);
    }
    return value;
  }

  /**
   * Start polling the device state
   */
  private startPolling(): void {
    this.pollingIntervalId = setInterval(async () => {
      try {
        const response = await axios.get<KeyLightOptions>(this.lightsEndpoint, {
          timeout: this.pollingRate,
        });

        if (this.options) {
          const oldLight = this.options.lights[0];
          const newLight = response.data.lights[0];

          if (oldLight.on !== newLight.on) {
            this.propertyChangedCallback('on', newLight.on);
          }
          if (oldLight.temperature !== newLight.temperature) {
            this.propertyChangedCallback('temperature', clampColorTemperature(newLight.temperature));
          }
          if (oldLight.brightness !== newLight.brightness) {
            this.propertyChangedCallback('brightness', newLight.brightness);
          }
        }

        this.options = response.data;
      } catch {
        this.log.debug(`Polling of ${this.displayName} failed, will retry`);
      }
    }, this.pollingRate);
  }

  /**
   * Stop polling the device. Called during shutdown or when device is removed.
   */
  public stopPolling(): void {
    if (this.pollingIntervalId !== null) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
      this.log.debug(`Stopped polling for ${this.displayName}`);
    }
  }
}
