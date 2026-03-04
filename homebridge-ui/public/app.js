// Constants
const ELGATO_DEFAULT_PORT = 9123;
const BRIGHTNESS_MIN = 3;
const BRIGHTNESS_MAX = 100;
const BRIGHTNESS_DEFAULT = 50;
const TEMPERATURE_MIN = 2900;
const TEMPERATURE_MAX = 7000;
const TEMPERATURE_DEFAULT = 4500;
const TEMPERATURE_STEP = 50;
const MIRED_CONVERSION_FACTOR = 1000000;

// Power on behavior options
const POWER_ON_BEHAVIOR = {
  USE_GLOBAL: 0,
  RESTORE_LAST: 1,
  USE_DEFAULT: 2,
};

let discoveredDevices = [];
let configuredDevices = [];
let currentDeviceIndex = -1;
let initialized = false;

// Initialize when homebridge is ready
if (typeof homebridge !== 'undefined') {
  homebridge.addEventListener('ready', () => {
    onHomebridgeReady();
  });
} else {
  document.getElementById('deviceList').innerHTML = `
    <div class="alert alert-danger m-3">
      <i class="bi bi-exclamation-triangle me-2"></i>
      Homebridge UI not available. Please refresh the page.
    </div>
  `;
}

async function onHomebridgeReady() {
  if (initialized) {
    return;
  }
  initialized = true;

  // Step 1: Load and display configured devices immediately
  await loadConfiguredDevices();

  // Step 2: Run discovery to update status and find new devices
  discoverDevices();
}

async function loadConfiguredDevices() {
  try {
    configuredDevices = await homebridge.request('/config/devices') || [];

    if (configuredDevices.length > 0) {
      // Display configured devices immediately with "Checking..." status
      discoveredDevices = configuredDevices.map(d => ({
        ...d,
        addresses: d.ip ? [d.ip] : [],
        online: null, // null = checking status
      }));
      renderDevices(discoveredDevices);
    } else {
      renderDevices([]);
    }
  } catch (e) {
    console.error('[KeyLights] Failed to load configured devices:', e);
    renderDevices([]);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from HTML onclick
function showListView() {
  MpKit.View.show('listView');
  currentDeviceIndex = -1;
  renderDevices(discoveredDevices);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from HTML onclick
function showSettingsView(index) {
  currentDeviceIndex = index;
  MpKit.View.show('settingsView');
  loadDeviceSettings(index);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from HTML onclick
function toggleManualAdd() {
  const form = document.getElementById('manualAddForm');
  form.classList.toggle('d-none');
  if (!form.classList.contains('d-none')) {
    document.getElementById('manualIp').focus();
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from HTML onclick
async function addDeviceByIp() {
  const ip = document.getElementById('manualIp').value.trim();
  const port = parseInt(document.getElementById('manualPort').value) || ELGATO_DEFAULT_PORT;

  if (!ip) {
    showToast('Please enter an IP address', 'danger');
    return;
  }

  const alreadyConfigured = discoveredDevices.some(d => d.addresses?.[0] === ip || d.ip === ip);
  if (alreadyConfigured) {
    showToast('A device with this IP is already configured', 'danger');
    return;
  }

  const btn = document.getElementById('addManualSubmit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Adding...';

  try {
    const result = await homebridge.request('/device/info', { host: ip, port });

    const deviceName = result.success ? (result.data?.displayName || result.data?.productName || `Key Light ${ip}`) : `Key Light ${ip}`;
    const model = result.success ? (result.data?.productName || 'Key Light') : 'Key Light';

    const newDevice = {
      name: deviceName,
      mac: '',
      host: ip,
      ip,
      port,
      model,
      displayName: '',
      powerOnBehavior: POWER_ON_BEHAVIOR.USE_GLOBAL,
      enabled: true,
      online: result.success,
      addresses: [ip],
    };

    discoveredDevices.push(newDevice);
    await saveDevicesToConfig(discoveredDevices);
    renderDevices(discoveredDevices);

    document.getElementById('manualAddForm').classList.add('d-none');
    document.getElementById('manualIp').value = '';
    document.getElementById('manualPort').value = String(ELGATO_DEFAULT_PORT);

    showToast(result.success ? `Added ${deviceName}` : `Added device at ${ip} (offline — check IP/port)`, result.success ? 'success' : 'info');
  } catch (error) {
    showToast(`Failed to add device: ${error.message}`, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-plus-circle me-1"></i>Add';
  }
}

async function discoverDevices() {
  const btn = document.getElementById('discoverBtn');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-discover me-1" role="status" aria-hidden="true"></span> Scanning network...';

  try {
    const discovered = await homebridge.request('/discover');

    // Merge: update existing configured devices, add new ones
    const mergedDevices = mergeDevices(configuredDevices, discovered);
    discoveredDevices = mergedDevices;
    renderDevices(mergedDevices);

    // Check for new devices not in config
    const newDevices = discovered.filter(d =>
      !configuredDevices.some(c => c.mac === d.mac),
    );

    if (newDevices.length > 0) {
      await saveDevicesToConfig(mergedDevices);
      showToast(`Found ${newDevices.length} new device(s)`, 'success');
    }
  } catch (error) {
    discoveredDevices = discoveredDevices.map(d => ({ ...d, online: false }));
    renderDevices(discoveredDevices);
    showToast('Discovery failed: ' + error.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-search me-1"></i> Discover';
  }
}

function mergeDevices(configured, discovered) {
  const merged = [];

  // First, update all configured devices with discovery info
  for (const config of configured) {
    const found = discovered.find(d => d.mac === config.mac);
    if (found) {
      merged.push({
        ...config,
        ...found,
        displayName: config.displayName,
        powerOnBehavior: config.powerOnBehavior,
        powerOnBrightness: config.powerOnBrightness,
        powerOnTemperature: config.powerOnTemperature,
        enabled: config.enabled,
        online: true,
      });
    } else {
      merged.push({
        ...config,
        addresses: config.ip ? [config.ip] : [],
        online: false,
      });
    }
  }

  // Then add any newly discovered devices not in config
  for (const device of discovered) {
    if (!configured.some(c => c.mac === device.mac)) {
      merged.push({
        ...device,
        enabled: true,
        online: true,
      });
    }
  }

  return merged;
}

async function saveDevicesToConfig(devices) {
  const devicesToSave = devices.map(d => ({
    name: d.name,
    mac: d.mac,
    host: d.host,
    ip: d.addresses?.[0] || d.ip || '',
    port: d.port || ELGATO_DEFAULT_PORT,
    model: d.model || 'Key Light',
    displayName: d.displayName || '',
    powerOnBehavior: d.powerOnBehavior || POWER_ON_BEHAVIOR.USE_GLOBAL,
    powerOnBrightness: d.powerOnBrightness,
    powerOnTemperature: d.powerOnTemperature,
    enabled: d.enabled !== false,
  }));

  try {
    const pluginConfig = await homebridge.getPluginConfig();
    if (pluginConfig && pluginConfig.length > 0) {
      pluginConfig[0].devices = devicesToSave;
      await homebridge.updatePluginConfig(pluginConfig);
      await homebridge.savePluginConfig();
      configuredDevices = devicesToSave;
    }
  } catch (e) {
    console.error('[KeyLights] Failed to save devices:', e);
    showToast(`Save error: ${e.message}`, 'danger');
  }
}

function renderDevices(devices) {
  const deviceList = document.getElementById('deviceList');

  if (devices.length === 0) {
    deviceList.innerHTML = MpKit.EmptyState.render({
      iconClass: 'bi bi-lightbulb',
      title: 'No Key Lights configured',
      hint: 'Click Discover to find devices on your network',
    });
    return;
  }

  deviceList.innerHTML = `
    <div class="list-group list-group-flush">
      ${devices.map((device, index) => {
    const isOffline = device.online === false;
    const isChecking = device.online === null;
    const statusBadge = isChecking
      ? MpKit.StatusBadge.checking()
      : isOffline
        ? MpKit.StatusBadge.offline()
        : MpKit.StatusBadge.online();
    return `
        <div class="list-group-item mp-device-card d-flex justify-content-between align-items-center py-3 ${isOffline ? 'opacity-50' : ''}" onclick="showSettingsView(${index})">
          <div class="d-flex align-items-center">
            <div class="me-3">
              <i class="bi bi-lightbulb-fill fs-3 ${isOffline ? 'text-secondary' : 'text-warning'}"></i>
            </div>
            <div>
              <div class="fw-semibold">
                ${device.displayName || device.name}
                ${device.enabled === false ? `<span class="ms-2">${MpKit.StatusBadge.disabled()}</span>` : ''}
                <span class="ms-2">${statusBadge}</span>
              </div>
              <div class="small text-body-secondary">
                <span class="me-2"><i class="bi bi-box me-1"></i>${device.model || 'Key Light'}</span>
                <span><i class="bi bi-ethernet me-1"></i>${device.addresses?.[0] || device.ip || device.host || 'Unknown'}</span>
              </div>
            </div>
          </div>
          <i class="bi bi-chevron-right text-body-secondary"></i>
        </div>
      `;
  }).join('')}
    </div>
  `;
}

async function loadDeviceSettings(index) {
  const device = discoveredDevices[index];
  const settingsContent = document.getElementById('settingsContent');

  document.getElementById('settingsDeviceName').textContent = device.displayName || device.name;
  document.getElementById('settingsDeviceModel').textContent = device.model || 'Key Light';
  document.getElementById('settingsDeviceStatus').innerHTML = device.online
    ? MpKit.StatusBadge.online()
    : MpKit.StatusBadge.offline();

  settingsContent.innerHTML = MpKit.Loading.render('Loading device information...');

  let deviceInfo = null;
  let currentState = null;

  if (device.online) {
    try {
      const host = device.addresses?.[0] || device.ip || device.host;
      const port = device.port || ELGATO_DEFAULT_PORT;
      const [infoResult, settingsResult] = await Promise.all([
        homebridge.request('/device/info', { host, port }),
        homebridge.request('/device/settings', { host, port }),
      ]);
      if (infoResult.success) {
        deviceInfo = infoResult.data;
      }
      if (settingsResult.success) {
        currentState = settingsResult.data?.lights?.lights?.[0];
      }
    } catch (e) {
      console.error('[KeyLights] Failed to get device info:', e);
    }
  }

  renderDeviceSettings(device, deviceInfo, currentState);
}

function renderDeviceSettings(device, deviceInfo, currentState) {
  const settingsContent = document.getElementById('settingsContent');
  const host = device.addresses?.[0] || device.ip || device.host;
  const kelvinTemp = currentState?.temperature ? Math.round(MIRED_CONVERSION_FACTOR / currentState.temperature) : null;
  const tempPercent = kelvinTemp ? ((kelvinTemp - TEMPERATURE_MIN) / (TEMPERATURE_MAX - TEMPERATURE_MIN) * 100) : BRIGHTNESS_DEFAULT;

  settingsContent.innerHTML = `
    <!-- Tabs Navigation -->
    <ul class="nav mp-tabs mb-4" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" id="status-tab" data-bs-toggle="tab" data-bs-target="#status-pane" type="button" role="tab">
          <i class="bi bi-activity me-1"></i> Status
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="settings-tab" data-bs-toggle="tab" data-bs-target="#settings-pane" type="button" role="tab">
          <i class="bi bi-gear me-1"></i> Settings
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="info-tab" data-bs-toggle="tab" data-bs-target="#info-pane" type="button" role="tab">
          <i class="bi bi-info-circle me-1"></i> Info
        </button>
      </li>
    </ul>

    <!-- Tab Content -->
    <div class="tab-content">
      <!-- Status Tab -->
      <div class="tab-pane fade show active" id="status-pane" role="tabpanel">
        ${currentState ? `
          <div class="card mp-settings-card mb-4">
            <div class="card-body">
              <div class="row g-4 mb-4">
                <div class="col-12">
                  <div class="d-flex align-items-center gap-3">
                    <span class="text-body-secondary" style="width: 90px;">Power</span>
                    <div class="fs-5">
                      ${currentState.on
    ? '<span class="badge bg-success"><i class="bi bi-circle-fill me-1"></i>On</span>'
    : '<span class="badge bg-secondary"><i class="bi bi-circle me-1"></i>Off</span>'}
                    </div>
                  </div>
                </div>
              </div>
              <div class="row g-4 mb-4">
                <div class="col-12">
                  <div class="d-flex align-items-center gap-3">
                    <span class="text-body-secondary" style="width: 90px;">Brightness</span>
                    <div class="flex-grow-1">
                      <div class="progress" style="height: 14px; background: linear-gradient(to right, #333 0%, #fff 100%); border-radius: 7px;">
                        <div class="progress-bar" role="progressbar" style="width: ${currentState.brightness || 0}%; background: transparent; border-right: 3px solid var(--mp-primary);"></div>
                      </div>
                    </div>
                    <span class="fw-bold" style="min-width: 60px; text-align: right;">${currentState.brightness || 0}%</span>
                  </div>
                </div>
              </div>
              <div class="row g-4">
                <div class="col-12">
                  <div class="d-flex align-items-center gap-3">
                    <span class="text-body-secondary" style="width: 90px;">Temperature</span>
                    <div class="flex-grow-1">
                      <div class="progress" style="height: 14px; background: linear-gradient(to right, #ff9329 0%, #fff 50%, #9fc5ff 100%); border-radius: 7px;">
                        <div class="progress-bar" role="progressbar" style="width: ${tempPercent}%; background: transparent; border-right: 3px solid var(--mp-primary);"></div>
                      </div>
                    </div>
                    <span class="fw-bold" style="min-width: 60px; text-align: right;">${kelvinTemp ? kelvinTemp + 'K' : 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-outline-secondary" onclick="identifyDevice(${currentDeviceIndex})">
              <i class="bi bi-stars me-1"></i> Identify
            </button>
            <button class="btn btn-outline-secondary" onclick="testConnection(${currentDeviceIndex})">
              <i class="bi bi-plug me-1"></i> Test Connection
            </button>
            <span id="testResult" class="align-self-center ms-2"></span>
          </div>
        ` : `
          <div class="alert alert-secondary">
            <i class="bi bi-wifi-off me-2"></i>Device is offline. Status unavailable.
          </div>
        `}
      </div>

      <!-- Settings Tab -->
      <div class="tab-pane fade" id="settings-pane" role="tabpanel">
        <div class="card mp-settings-card mb-4">
          <div class="card-body">
            <div class="mb-4">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="deviceEnabled" ${device.enabled !== false ? 'checked' : ''}>
                <label class="form-check-label" for="deviceEnabled">Enable this device in HomeKit</label>
              </div>
            </div>

            <div class="mb-4">
              <label class="form-label" for="displayName">Display Name</label>
              <input type="text" class="form-control" id="displayName" value="${device.displayName || ''}" placeholder="${device.name}">
              <div class="form-text">Custom name to show in HomeKit (leave empty to use device name)</div>
            </div>

            <div class="mb-4">
              <label class="form-label" for="powerOnBehavior">Power On Behavior</label>
              <select class="form-select" id="powerOnBehavior">
                <option value="${POWER_ON_BEHAVIOR.USE_GLOBAL}" ${device.powerOnBehavior === POWER_ON_BEHAVIOR.USE_GLOBAL || !device.powerOnBehavior ? 'selected' : ''}>Use global setting</option>
                <option value="${POWER_ON_BEHAVIOR.RESTORE_LAST}" ${device.powerOnBehavior === POWER_ON_BEHAVIOR.RESTORE_LAST ? 'selected' : ''}>Restore last settings used</option>
                <option value="${POWER_ON_BEHAVIOR.USE_DEFAULT}" ${device.powerOnBehavior === POWER_ON_BEHAVIOR.USE_DEFAULT ? 'selected' : ''}>Use default settings below</option>
              </select>
            </div>

            <hr class="my-4">
            <h6 class="mp-label mb-3"><i class="bi bi-sliders2 me-2"></i>Default Power On Settings</h6>
            <p class="small text-body-secondary mb-4">Used when "Use default settings below" is selected.</p>

            <!-- Brightness Slider -->
            <div class="mb-4">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <label class="form-label mb-0">
                  <i class="bi bi-brightness-high me-2"></i>Brightness
                </label>
                <span class="slider-value" id="brightnessValue">${device.powerOnBrightness || BRIGHTNESS_DEFAULT}%</span>
              </div>
              <div class="slider-container">
                <input type="range" class="brightness-slider" id="powerOnBrightness"
                  min="${BRIGHTNESS_MIN}" max="${BRIGHTNESS_MAX}" value="${device.powerOnBrightness || BRIGHTNESS_DEFAULT}"
                  oninput="updateBrightnessValue(this.value)">
                <div class="slider-label">
                  <span>${BRIGHTNESS_MIN}%</span>
                  <span>${BRIGHTNESS_MAX}%</span>
                </div>
              </div>
            </div>

            <!-- Temperature Slider -->
            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <label class="form-label mb-0">
                  <i class="bi bi-thermometer-half me-2"></i>Color Temperature
                </label>
                <span class="slider-value" id="temperatureValue">${device.powerOnTemperature || TEMPERATURE_DEFAULT}K</span>
              </div>
              <div class="slider-container">
                <input type="range" class="temperature-slider" id="powerOnTemperature"
                  min="${TEMPERATURE_MIN}" max="${TEMPERATURE_MAX}" step="${TEMPERATURE_STEP}" value="${device.powerOnTemperature || TEMPERATURE_DEFAULT}"
                  oninput="updateTemperatureValue(this.value)">
                <div class="slider-label">
                  <span>${TEMPERATURE_MIN}K (Warm)</span>
                  <span>${TEMPERATURE_MAX}K (Cool)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-secondary" onclick="showListView()">Cancel</button>
          <button class="btn btn-primary" onclick="saveDeviceSettings(${currentDeviceIndex})">
            <i class="bi bi-check-lg me-1"></i> Save Settings
          </button>
        </div>
      </div>

      <!-- Info Tab -->
      <div class="tab-pane fade" id="info-pane" role="tabpanel">
        <div class="card mp-settings-card">
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="mp-label mb-1">Product</label>
                <div class="fw-medium">${deviceInfo?.productName || device.model || 'Elgato Key Light'}</div>
              </div>
              <div class="col-md-6">
                <label class="mp-label mb-1">Serial Number</label>
                <div class="fw-medium font-monospace">${deviceInfo?.serialNumber || 'Unknown'}</div>
              </div>
              <div class="col-md-6">
                <label class="mp-label mb-1">Firmware Version</label>
                <div class="fw-medium">${deviceInfo?.firmwareVersion || 'Unknown'}</div>
              </div>
              <div class="col-md-6">
                <label class="mp-label mb-1">MAC Address</label>
                <div class="fw-medium font-monospace">${device.mac || 'Unknown'}</div>
              </div>
              <div class="col-md-6">
                <label class="mp-label mb-1">IP Address</label>
                <div class="fw-medium font-monospace">${host || 'Unknown'}</div>
              </div>
              <div class="col-md-6">
                <label class="mp-label mb-1">Port</label>
                <div class="fw-medium">${device.port || ELGATO_DEFAULT_PORT}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from HTML oninput
function updateBrightnessValue(value) {
  document.getElementById('brightnessValue').textContent = value + '%';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from HTML oninput
function updateTemperatureValue(value) {
  document.getElementById('temperatureValue').textContent = value + 'K';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from HTML onclick
async function saveDeviceSettings(index) {
  const device = discoveredDevices[index];

  device.enabled = document.getElementById('deviceEnabled').checked;
  device.displayName = document.getElementById('displayName').value.trim();
  device.powerOnBehavior = parseInt(document.getElementById('powerOnBehavior').value);
  device.powerOnBrightness = parseInt(document.getElementById('powerOnBrightness').value);
  device.powerOnTemperature = parseInt(document.getElementById('powerOnTemperature').value);

  discoveredDevices[index] = device;

  await saveDevicesToConfig(discoveredDevices);
  showToast('Device settings saved', 'success');

  document.getElementById('settingsDeviceName').textContent = device.displayName || device.name;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from HTML onclick
async function identifyDevice(index) {
  const device = discoveredDevices[index];
  const host = device.addresses?.[0] || device.ip || device.host;
  try {
    const result = await homebridge.request('/device/identify', {
      host,
      port: device.port || ELGATO_DEFAULT_PORT,
    });
    if (result.success) {
      showToast(`Identifying ${device.name}...`, 'success');
    } else {
      showToast(`Failed to identify: ${result.error}`, 'danger');
    }
  } catch (error) {
    showToast(`Error: ${error.message}`, 'danger');
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from HTML onclick
async function testConnection(index) {
  const device = discoveredDevices[index];
  const host = device.addresses?.[0] || device.ip || device.host;
  const resultSpan = document.getElementById('testResult');
  resultSpan.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Testing...';

  try {
    const result = await homebridge.request('/device/test', { host, port: device.port || ELGATO_DEFAULT_PORT });
    if (result.success) {
      resultSpan.innerHTML = `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Connected (${result.latency}ms)</span>`;
    } else {
      resultSpan.innerHTML = `<span class="badge bg-danger"><i class="bi bi-x-circle me-1"></i>${result.error}</span>`;
    }
  } catch (error) {
    resultSpan.innerHTML = `<span class="badge bg-danger"><i class="bi bi-x-circle me-1"></i>${error.message}</span>`;
  }
}

function showToast(message, type) {
  if (typeof homebridge !== 'undefined' && homebridge.toast) {
    if (type === 'success') {
      homebridge.toast.success(message);
    } else if (type === 'danger') {
      homebridge.toast.error(message);
    } else {
      homebridge.toast.info(message);
    }
  }
}
