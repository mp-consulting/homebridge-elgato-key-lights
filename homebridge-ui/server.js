import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import { Bonjour } from 'bonjour-service';
import axios from 'axios';

class KeyLightsUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    // Register request handlers
    this.onRequest('/discover', this.discoverDevices.bind(this));
    this.onRequest('/device/info', this.getDeviceInfo.bind(this));
    this.onRequest('/device/settings', this.getDeviceSettings.bind(this));
    this.onRequest('/device/settings/update', this.updateDeviceSettings.bind(this));
    this.onRequest('/device/identify', this.identifyDevice.bind(this));
    this.onRequest('/device/test', this.testConnection.bind(this));

    this.ready();
  }

  /**
   * Discover Elgato Key Lights on the network using mDNS
   */
  async discoverDevices() {
    return new Promise((resolve) => {
      const devices = [];
      const bonjour = new Bonjour();
      const timeout = 5000; // 5 second discovery window

      const browser = bonjour.find({ type: 'elg' }, (service) => {
        const device = {
          name: service.name,
          host: service.host,
          port: service.port,
          addresses: service.addresses || [],
          mac: service.txt?.id || '',
          manufacturer: service.txt?.mf || 'Elgato',
          model: service.txt?.md || 'Key Light',
        };

        // Avoid duplicates by MAC address
        if (!devices.some(d => d.mac === device.mac)) {
          devices.push(device);
        }
      });

      // Stop discovery after timeout and return results
      setTimeout(() => {
        browser.stop();
        bonjour.destroy();
        resolve(devices);
      }, timeout);
    });
  }

  /**
   * Get device info from a specific Key Light
   */
  async getDeviceInfo(payload) {
    const { host, port } = payload;
    try {
      const response = await axios.get(`http://${host}:${port}/elgato/accessory-info`, {
        timeout: 3000,
      });
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to get device info',
      };
    }
  }

  /**
   * Get device settings from a specific Key Light
   */
  async getDeviceSettings(payload) {
    const { host, port } = payload;
    try {
      const [lightsResponse, settingsResponse] = await Promise.all([
        axios.get(`http://${host}:${port}/elgato/lights`, { timeout: 3000 }),
        axios.get(`http://${host}:${port}/elgato/lights/settings`, { timeout: 3000 }),
      ]);
      return {
        success: true,
        data: {
          lights: lightsResponse.data,
          settings: settingsResponse.data,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to get device settings',
      };
    }
  }

  /**
   * Update device settings on a specific Key Light
   */
  async updateDeviceSettings(payload) {
    const { host, port, settings } = payload;
    try {
      await axios.put(`http://${host}:${port}/elgato/lights/settings`, settings, {
        timeout: 3000,
      });
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to update device settings',
      };
    }
  }

  /**
   * Trigger identify on a device (flash the light)
   */
  async identifyDevice(payload) {
    const { host, port } = payload;
    try {
      await axios.post(`http://${host}:${port}/elgato/identify`, {}, {
        timeout: 3000,
      });
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to identify device',
      };
    }
  }

  /**
   * Test connection to a device
   */
  async testConnection(payload) {
    const { host, port } = payload;
    try {
      const startTime = Date.now();
      const response = await axios.get(`http://${host}:${port}/elgato/accessory-info`, {
        timeout: 3000,
      });
      const latency = Date.now() - startTime;
      return {
        success: true,
        latency,
        deviceName: response.data.displayName || response.data.productName,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Connection failed',
      };
    }
  }
}

(() => {
  return new KeyLightsUiServer();
})();
