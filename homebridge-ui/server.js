import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import { Bonjour } from 'bonjour-service';
import axios from 'axios';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DISCOVERY_TIMEOUT_MS = 5000;
const HTTP_REQUEST_TIMEOUT_MS = 3000;
const MDNS_SERVICE_TYPE = 'elg';
const PLUGIN_PLATFORM_NAME = 'ElgatoKeyLights';

const buildDeviceUrl = (host, port, path) => `http://${host}:${port}/elgato/${path}`;

const axiosConfig = { timeout: HTTP_REQUEST_TIMEOUT_MS };

class KeyLightsUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.cachedDevices = [];

    const routes = [
      ['/config/devices', this.getConfiguredDevices],
      ['/config/devices/save', this.saveDevices],
      ['/discover', this.discoverDevices],
      ['/device/info', this.getDeviceInfo],
      ['/device/settings', this.getDeviceSettings],
      ['/device/settings/update', this.updateDeviceSettings],
      ['/device/identify', this.identifyDevice],
      ['/device/test', this.testConnection],
    ];
    routes.forEach(([path, handler]) => this.onRequest(path, handler.bind(this)));

    this.ready();
  }

  async withDeviceRequest(host, port, requestFn, errorMessage) {
    try {
      const result = await requestFn(buildDeviceUrl.bind(null, host, port));
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message || errorMessage };
    }
  }

  /**
   * Get configured devices from plugin config
   */
  async getConfiguredDevices() {
    try {
      let pluginConfig = [];

      // Try to use the official API if available
      if (typeof this.getPluginConfig === 'function') {
        try {
          pluginConfig = await this.getPluginConfig();
        } catch {
          // API not available, will use file fallback
        }
      }

      // If plugin config is empty, read from storage path directly
      if (!pluginConfig || pluginConfig.length === 0) {
        pluginConfig = this.getConfigFromFile();
      }

      // Find the config block for this platform
      const config = pluginConfig.find(c => c.platform === PLUGIN_PLATFORM_NAME) || pluginConfig[0];
      return config?.devices || [];
    } catch (error) {
      console.error('[KeyLights] Error getting devices:', error.message);
      return [];
    }
  }

  /**
   * Read config directly from file system
   */
  getConfigFromFile() {
    const possiblePaths = [];

    // First priority: use homebridgeStoragePath if available (set by -U flag)
    if (this.homebridgeStoragePath) {
      const storagePath = this.homebridgeStoragePath.startsWith('.')
        ? join(process.cwd(), this.homebridgeStoragePath)
        : this.homebridgeStoragePath;
      possiblePaths.push(join(storagePath, 'config.json'));
    }

    // Fallback paths
    const projectRoot = join(__dirname, '..');
    possiblePaths.push(
      join(projectRoot, 'test', 'hbConfig', 'config.json'),
      join(process.env.HOME || '', '.homebridge', 'config.json'),
      '/var/lib/homebridge/config.json',
    );

    for (const configPath of possiblePaths) {
      try {
        const configData = readFileSync(configPath, 'utf-8');
        const fullConfig = JSON.parse(configData);
        const platforms = fullConfig.platforms || [];
        const ourConfig = platforms.filter(p => p.platform === PLUGIN_PLATFORM_NAME);

        if (ourConfig.length > 0) {
          return ourConfig;
        }
      } catch {
        // File not found or not readable, try next
      }
    }

    return [];
  }

  /**
   * Save devices to plugin config
   */
  async saveDevices(payload) {
    try {
      const pluginConfig = await this.getPluginConfig();
      if (pluginConfig && pluginConfig.length > 0) {
        pluginConfig[0].devices = payload.devices;
        await this.updatePluginConfig(pluginConfig);
        if (typeof this.savePluginConfig === 'function') {
          await this.savePluginConfig();
        }
        return { success: true, devices: pluginConfig[0].devices };
      }
      return { success: false, error: 'No plugin config found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Discover Elgato Key Lights on the network using mDNS
   */
  async discoverDevices() {
    return new Promise((resolve) => {
      const devices = [];
      let bonjour;

      try {
        bonjour = new Bonjour();
      } catch (error) {
        console.error('[KeyLights] Failed to create Bonjour instance:', error.message);
        resolve([]);
        return;
      }

      const browser = bonjour.find({ type: MDNS_SERVICE_TYPE });

      browser.on('up', (service) => {
        const device = {
          name: service.name,
          host: service.host,
          port: service.port,
          addresses: service.addresses || [],
          mac: service.txt?.id || '',
          manufacturer: service.txt?.mf || 'Elgato',
          model: service.txt?.md || 'Key Light',
        };

        // Avoid duplicates by MAC address or name if MAC is empty
        const isDuplicate = device.mac
          ? devices.some(d => d.mac === device.mac)
          : devices.some(d => d.name === device.name);

        if (!isDuplicate) {
          devices.push(device);
        }
      });

      // Stop discovery after timeout and return results
      setTimeout(() => {
        try {
          browser.stop();
          bonjour.destroy();
        } catch {
          // Ignore cleanup errors
        }

        this.cachedDevices = devices;
        resolve(devices);
      }, DISCOVERY_TIMEOUT_MS);
    });
  }

  async getDeviceInfo({ host, port }) {
    return this.withDeviceRequest(host, port, async (url) => {
      const { data } = await axios.get(url('accessory-info'), axiosConfig);
      return { data };
    }, 'Failed to get device info');
  }

  async getDeviceSettings({ host, port }) {
    return this.withDeviceRequest(host, port, async (url) => {
      const [lightsResponse, settingsResponse] = await Promise.all([
        axios.get(url('lights'), axiosConfig),
        axios.get(url('lights/settings'), axiosConfig),
      ]);
      return { data: { lights: lightsResponse.data, settings: settingsResponse.data } };
    }, 'Failed to get device settings');
  }

  async updateDeviceSettings({ host, port, settings }) {
    return this.withDeviceRequest(host, port, async (url) => {
      await axios.put(url('lights/settings'), settings, axiosConfig);
      return {};
    }, 'Failed to update device settings');
  }

  async identifyDevice({ host, port }) {
    return this.withDeviceRequest(host, port, async (url) => {
      await axios.post(url('identify'), {}, axiosConfig);
      return {};
    }, 'Failed to identify device');
  }

  async testConnection({ host, port }) {
    const startTime = Date.now();
    return this.withDeviceRequest(host, port, async (url) => {
      const { data } = await axios.get(url('accessory-info'), axiosConfig);
      return { latency: Date.now() - startTime, deviceName: data.displayName || data.productName };
    }, 'Connection failed');
  }
}

(() => {
  return new KeyLightsUiServer();
})();
