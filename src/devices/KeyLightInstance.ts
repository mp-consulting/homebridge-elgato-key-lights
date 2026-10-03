import type { CharacteristicValue, Logger } from 'homebridge';
import axios from 'axios';

import {
  API_PATHS,
  DEFAULT_POLLING_RATE_MS,
  MIN_POLLING_RATE_MS,
  OFFLINE_POLL_FAILURE_THRESHOLD,
  REQUEST_TIMEOUT_MS,
  clampColorTemperature,
} from '../config/constants.js';
import type {
  KeyLight,
  KeyLightSettings,
  KeyLightInfo,
  KeyLightOptions,
  LightProperty,
  PropertyChangedCallback,
  ReachabilityChangedCallback,
} from '../types/index.js';
import { resolveHostname } from '../utils/dns-resolver.js';

const requestConfig = { timeout: REQUEST_TIMEOUT_MS };

/**
 * Validate a configured polling rate, falling back to the default for missing or invalid values
 */
export function normalizePollingRate(pollingRate: unknown): number {
  if (typeof pollingRate !== 'number' || !Number.isFinite(pollingRate)) {
    return DEFAULT_POLLING_RATE_MS;
  }
  return Math.max(MIN_POLLING_RATE_MS, Math.round(pollingRate));
}

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
  private pollingTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private consecutivePollFailures = 0;
  private propertyChangedCallback: PropertyChangedCallback = () => {};
  private reachabilityChangedCallback: ReachabilityChangedCallback = () => {};

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
    const instance = new KeyLightInstance(data, log, normalizePollingRate(pollingRate));

    // Try to resolve the hostname using multiple methods (DNS, ARP, fallback addresses)
    const resolvedHostname = await resolveHostname(data.hostname, data.mac, data.addresses);
    if (resolvedHostname !== data.hostname) {
      log.info(`Resolved ${data.hostname} to ${resolvedHostname} for ${data.name}`);
      instance.hostname = resolvedHostname;
    }

    try {
      const [infoResponse, optionsResponse, settingsResponse] = await Promise.all([
        axios.get<KeyLightInfo>(instance.infoEndpoint, requestConfig),
        axios.get<KeyLightOptions>(instance.lightsEndpoint, requestConfig),
        axios.get<KeyLightSettings>(instance.settingsEndpoint, requestConfig),
      ]);

      instance.info = infoResponse.data;
      instance.options = optionsResponse.data;
      instance.settings = settingsResponse.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error(`Failed to initialize device ${data.name}: ${message}`);
      throw new Error(`Device initialization failed: ${message}`, { cause: error });
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

  /**
   * Whether the light answered recently. Turns false after several consecutive failed polls.
   */
  public get reachable(): boolean {
    return this.consecutivePollFailures < OFFLINE_POLL_FAILURE_THRESHOLD;
  }

  private get baseEndpoint(): string {
    // IPv6 literals must be bracketed inside a URL
    const host = this.hostname.includes(':') ? `[${this.hostname}]` : this.hostname;
    return `http://${host}:${this.port}${API_PATHS.BASE}`;
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

  public set onReachabilityChanged(callback: ReachabilityChangedCallback) {
    this.reachabilityChangedCallback = callback;
  }

  /**
   * Update the connection information when the light is rediscovered on a new address
   */
  public updateConnectionData(data: KeyLight): void {
    this.hostname = data.hostname;
    this.port = data.port;
  }

  /**
   * Update device settings (power-on behavior, transition durations, etc.)
   */
  public async updateSettings(settings: KeyLightSettings): Promise<void> {
    try {
      await axios.put(this.settingsEndpoint, settings, requestConfig);
      const response = await axios.get<KeyLightSettings>(this.settingsEndpoint, requestConfig);
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
      await axios.post(this.identifyEndpoint, undefined, requestConfig);
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
    await axios.put(this.lightsEndpoint, { lights: [{ [property]: value }] }, requestConfig);
    // Keep the cached state in sync so reads before the next poll return the new value,
    // and the next poll does not echo our own change back to HomeKit
    const light = this.options?.lights[0];
    if (light && typeof value === 'number') {
      light[property] = value;
    }
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
   * Start polling the device state. Each poll is scheduled only after the previous one
   * settles, so a slow light can never accumulate overlapping requests.
   */
  private startPolling(): void {
    this.polling = true;
    this.scheduleNextPoll();
  }

  private scheduleNextPoll(): void {
    if (!this.polling) {
      return;
    }
    this.pollingTimeoutId = setTimeout(() => {
      void this.poll().finally(() => this.scheduleNextPoll());
    }, this.pollingRate);
  }

  private async poll(): Promise<void> {
    let response;
    try {
      response = await axios.get<KeyLightOptions>(this.lightsEndpoint, {
        timeout: this.pollingRate,
      });
    } catch {
      this.consecutivePollFailures++;
      if (this.consecutivePollFailures === OFFLINE_POLL_FAILURE_THRESHOLD) {
        this.log.warn(`${this.displayName} is not responding, will keep retrying`);
        this.reachabilityChangedCallback(false);
      } else {
        this.log.debug(`Polling of ${this.displayName} failed, will retry`);
      }
      return;
    }

    const wasReachable = this.reachable;
    this.consecutivePollFailures = 0;
    if (!wasReachable) {
      this.log.info(`${this.displayName} is responding again`);
      this.reachabilityChangedCallback(true);
    }

    const newLight = response.data?.lights?.[0];
    if (!newLight) {
      return;
    }

    const oldLight = this.options?.lights[0];
    if (oldLight) {
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
  }

  /**
   * Stop polling the device. Called during shutdown or when device is removed.
   */
  public stopPolling(): void {
    this.polling = false;
    if (this.pollingTimeoutId !== null) {
      clearTimeout(this.pollingTimeoutId);
      this.pollingTimeoutId = null;
      this.log.debug(`Stopped polling for ${this.displayName}`);
    }
  }
}
