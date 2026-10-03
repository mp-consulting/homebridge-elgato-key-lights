import type {
  Service,
  PlatformAccessory,
  CharacteristicValue,
} from 'homebridge';

import type { KeyLightsPlatform } from '../platform/KeyLightsPlatform.js';
import type { KeyLightInstance } from '../devices/KeyLightInstance.js';
import { COLOR_TEMPERATURE, clampColorTemperature } from '../config/constants.js';
import type { LightProperty } from '../types/index.js';

/**
 * Platform Accessory for the Key Light.
 * An instance of this class is created for each light.
 */
export class KeyLightsAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: KeyLightsPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly light: KeyLightInstance,
    private readonly displayName: string = light.displayName,
  ) {
    const { Characteristic, Service } = this.platform;

    // Set accessory information
    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, this.light.manufacturer)
      .setCharacteristic(Characteristic.Model, this.light.model)
      .setCharacteristic(Characteristic.SerialNumber, this.light.serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, this.light.firmwareVersion);

    this.light.onPropertyChanged = this.onPropertyChanged.bind(this);

    // Get the LightBulb service if it exists, otherwise create a new LightBulb service
    this.service = this.accessory.getService(Service.Lightbulb)
      ?? this.accessory.addService(Service.Lightbulb);

    // Set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(Characteristic.Name, this.displayName);

    // Set ConfiguredName for better HomeKit display
    this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
    this.service.updateCharacteristic(Characteristic.ConfiguredName, this.displayName);

    this.service.getCharacteristic(Characteristic.On)
      .onSet((value) => this.setProperty('on', 'On', value ? 1 : 0))
      .onGet(() => this.getProperty('on') === 1);

    this.service.getCharacteristic(Characteristic.Brightness)
      .onSet((value) => this.setProperty('brightness', 'Brightness', value))
      .onGet(() => this.getProperty('brightness'));

    // The current device value must be set before narrowing the range: the HAP default
    // (140 mirek) is outside our valid range and setProps warns on out-of-range values.
    this.service.getCharacteristic(Characteristic.ColorTemperature)
      .onSet((value) => this.setProperty('temperature', 'Color Temperature', value))
      .onGet(() => this.getProperty('temperature'))
      .updateValue(this.light.getProperty('temperature'))
      .setProps({
        validValueRanges: [COLOR_TEMPERATURE.MIN_MIREK, COLOR_TEMPERATURE.MAX_MIREK],
      });

    // Register handler for Identify functionality
    this.accessory.on('identify', () => {
      void this.light.identify();
    });
  }

  /**
   * Send a property to the light, reporting a communication failure to HomeKit on error
   */
  private async setProperty(property: LightProperty, characteristicName: string, value: CharacteristicValue): Promise<void> {
    try {
      await this.light.setProperty(property, value);
      this.platform.log.debug(`Set Characteristic ${characteristicName} -> ${value} successfully on ${this.accessory.displayName}`);
    } catch (error) {
      this.platform.log.error(`Set Characteristic ${characteristicName} -> ${value} failed on ${this.accessory.displayName}`);
      this.platform.log.debug(String(error));
      throw this.communicationFailure();
    }
  }

  /**
   * Read a cached property; reports "No Response" while the light is unreachable
   * instead of serving stale values
   */
  private getProperty(property: LightProperty): number {
    if (!this.light.reachable) {
      throw this.communicationFailure();
    }
    return this.light.getProperty(property);
  }

  private communicationFailure(): Error {
    const { HapStatusError, HAPStatus } = this.platform.api.hap;
    return new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  /**
   * Callback function to update HomeKit when a property has been changed externally
   */
  private onPropertyChanged(property: LightProperty, value: number): void {
    this.platform.log.debug(
      `Updating property ${property} of device ${this.accessory.displayName} to ${value}`,
    );

    switch (property) {
      case 'on':
        this.service.updateCharacteristic(this.platform.Characteristic.On, value === 1);
        break;
      case 'temperature':
        this.service.updateCharacteristic(
          this.platform.Characteristic.ColorTemperature,
          clampColorTemperature(value),
        );
        break;
      case 'brightness':
        this.service.updateCharacteristic(this.platform.Characteristic.Brightness, value);
        break;
    }
  }
}
