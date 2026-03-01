import type {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import type { KeyLightsPlatform } from '../platform/KeyLightsPlatform.js';
import type { KeyLightInstance } from '../devices/KeyLightInstance.js';
import { COLOR_TEMPERATURE, clampColorTemperature } from '../config/constants.js';
import type { KeyLight, LightProperty } from '../types/index.js';

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
    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, this.light.manufacturer)
      .setCharacteristic(this.platform.Characteristic.Model, this.light.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.light.serialNumber)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.light.firmwareVersion);

    this.light.onPropertyChanged = this.onPropertyChanged.bind(this);

    // Get the LightBulb service if it exists, otherwise create a new LightBulb service
    this.service = this.accessory.getService(this.platform.Service.Lightbulb)
      ?? this.accessory.addService(this.platform.Service.Lightbulb);

    // Set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.displayName);

    // Set ConfiguredName for better HomeKit display
    this.service.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.service.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.displayName);

    // Register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on('set', this.setOn.bind(this))
      .on('get', this.getOn.bind(this));

    // Register handlers for the Brightness Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .on('set', this.setBrightness.bind(this))
      .on('get', this.getBrightness.bind(this));

    // Register handlers for the Color Temperature Characteristic and set the valid value range
    this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
      .on('set', this.setColorTemperature.bind(this))
      .on('get', this.getColorTemperature.bind(this))
      .setProps({
        validValueRanges: [COLOR_TEMPERATURE.MIN_MIREK, COLOR_TEMPERATURE.MAX_MIREK],
      });

    // Register handler for Identify functionality
    this.accessory.on('identify', () => {
      this.light.identify();
    });
  }

  /**
   * Helper method to set a characteristic property with consistent error handling
   */
  private setCharacteristicProperty(
    property: LightProperty,
    characteristicName: string,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ): void {
    this.light.setProperty(property, value)
      .then(() => {
        this.platform.log.debug(
          `Set Characteristic ${characteristicName} -> ${value} successfully on ${this.accessory.displayName}`,
        );
        callback(null);
      })
      .catch((error: unknown) => {
        this.platform.log.error(
          `Set Characteristic ${characteristicName} -> ${value} failed on ${this.accessory.displayName}`,
        );
        this.platform.log.debug(String(error));
        callback(new Error(`Failed to set ${characteristicName}`));
      });
  }

  /**
   * Handler for setting the On/Off state
   */
  private setOn(value: CharacteristicValue, callback: CharacteristicSetCallback): void {
    const numericValue = value ? 1 : 0;
    this.setCharacteristicProperty('on', 'On', numericValue, callback);
  }

  /**
   * Handler for getting the On/Off state
   */
  private getOn(callback: CharacteristicGetCallback): void {
    callback(null, this.light.options?.lights[0].on);
  }

  /**
   * Handler for setting the brightness
   */
  private setBrightness(value: CharacteristicValue, callback: CharacteristicSetCallback): void {
    this.setCharacteristicProperty('brightness', 'Brightness', value, callback);
  }

  /**
   * Handler for getting the brightness
   */
  private getBrightness(callback: CharacteristicGetCallback): void {
    callback(null, this.light.getProperty('brightness'));
  }

  /**
   * Handler for setting the color temperature
   */
  private setColorTemperature(value: CharacteristicValue, callback: CharacteristicSetCallback): void {
    this.setCharacteristicProperty('temperature', 'Color Temperature', value, callback);
  }

  /**
   * Handler for getting the color temperature
   */
  private getColorTemperature(callback: CharacteristicGetCallback): void {
    const temp = this.light.getProperty('temperature');
    callback(null, clampColorTemperature(temp));
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
        this.service.updateCharacteristic(this.platform.Characteristic.On, value);
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

  /**
   * Update the connection information.
   * Called from platform handler when the light gets a new IP address.
   */
  public updateConnectionData(data: KeyLight): void {
    this.light.hostname = data.hostname;
    this.light.port = data.port;
  }
}
