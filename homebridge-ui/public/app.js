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

/**
 * Escape a value for interpolation into HTML. Device names, models and info come from
 * mDNS announcements and device HTTP responses, which anyone on the LAN can spoof.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Coerce a device-reported value to a finite number for interpolation into HTML/CSS
 */
function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

let discoveredDevices = [];
let configuredDevices = [];
let currentDeviceIndex = -1;
let initialized = false;

// ── Assistant (Homebridge AI Kit) ──────────────────────────────
// Shown only when the shared HomebridgeAiKit platform is set up and enabled.

let assistantEnabled = false;
let assistantSettings = {};

async function initAssistant() {
  let available = false;
  try {
    if (window.MpKit && MpKit.ai) {
      const status = await MpKit.ai.status();
      available = true;
      assistantEnabled = !!(status && status.enabled);
    }
  } catch {
    // Routes missing or older Homebridge UI: no Assistant
  }
  if (assistantEnabled) {
    try {
      const pluginConfig = await homebridge.getPluginConfig();
      assistantSettings = (pluginConfig && pluginConfig[0]) || {};
    } catch {
      assistantSettings = {};
    }
  }
  if (available && !assistantEnabled) {
    document.getElementById('assistant-hint').classList.remove('d-none');
  }
}

/**
 * Error text sent to the Assistant: device IP addresses, MAC addresses and .local
 * hostnames (they appear in network errors such as "connect ECONNREFUSED 192.168.1.5:9123") are masked.
 */
function scrubAddresses(text) {
  return String(text ?? '')
    .replace(/\b(?:[0-9a-f]{1,2}[:-]){5}[0-9a-f]{1,2}\b/gi, '<MAC>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<light IP>')
    .replace(/\[[0-9a-f:]*:[0-9a-f:]*\]/gi, '<light IP>')
    .replace(/\b[\w-]+\.local\b/gi, '<light hostname>.local');
}

// Light facts the Assistant may see: no IP addresses, hostnames, MAC addresses or serial numbers
function assistantDevice(device, deviceInfo) {
  return {
    name: device.displayName || device.name,
    model: device.model || 'Key Light',
    firmwareVersion: deviceInfo?.firmwareVersion,
    online: device.online,
    enabledInHomeKit: device.enabled !== false,
    inConfig: configuredDevices.some(c => c.mac && c.mac === device.mac),
    hasMacAddress: !!device.mac,
    hasConfiguredIp: !!device.ip,
    port: toNumber(device.port, ELGATO_DEFAULT_PORT) || ELGATO_DEFAULT_PORT,
    powerOnBehavior: device.powerOnBehavior ?? POWER_ON_BEHAVIOR.USE_GLOBAL,
  };
}

// Plugin settings the Assistant may see (no addresses)
function assistantContext(extra) {
  const pollingRate = toNumber(assistantSettings.pollingRate, 1000) || 1000;
  return [
    extra,
    assistantSettings.useIP ? 'useIP is on (the plugin connects to IP addresses).' : 'useIP is off (the plugin connects to .local hostnames).',
    `Polling rate: ${pollingRate} ms.`,
    `${configuredDevices.length} light(s) in the configuration.`,
  ].filter(Boolean).join(' ');
}

// Streams an explanation of `error` into `answerEl`
async function explainWithAssistant(button, answerEl, { error, context, device, title }) {
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  answerEl.classList.remove('d-none');
  const answer = MpKit.ai.renderAnswer(answerEl, { title });
  try {
    const res = await MpKit.ai.explain({ error: scrubAddresses(error), context, device }, { onChunk: answer.append });
    answer.done(res);
  } catch (e) {
    answer.error(e);
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

// Shows an error in `containerId`, with an "Explain" button when the Assistant is on
function showProblem(containerId, { message, context, device, title, variant = 'danger', icon = 'bi-exclamation-triangle' }) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }
  container.classList.remove('d-none');
  container.innerHTML = `
    <div class="alert alert-${variant} mb-0">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div><i class="bi ${icon} me-2"></i>${escapeHtml(message)}</div>
        ${assistantEnabled ? MpKit.ai.renderButton({ label: 'Explain', size: 'sm', className: 'flex-shrink-0 js-explain' }) : ''}
      </div>
    </div>
    <div class="assistant-answer mt-2 d-none"></div>
  `;
  if (assistantEnabled) {
    const button = container.querySelector('.js-explain');
    const answerEl = container.querySelector('.assistant-answer');
    button.addEventListener('click', () => explainWithAssistant(button, answerEl, {
      error: message,
      context: assistantContext(context),
      device,
      title,
    }));
  }
}

function clearProblem(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.classList.add('d-none');
    container.innerHTML = '';
  }
}

// Why a light in the list needs attention, or null when it looks fine
function deviceProblem(device) {
  if (device.online === false) {
    return 'This light did not answer during the 5 second mDNS discovery scan, so it is shown as offline.';
  }
  if (device.online !== null && !device.mac) {
    return 'This light has no MAC address in the configuration, so the plugin skips it (lights are keyed by MAC address).';
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from HTML onclick
function explainDevice(index, button) {
  const device = discoveredDevices[index];
  const answerEl = document.getElementById(`assistant-answer-${index}`);
  if (!device || !answerEl) {
    return;
  }
  explainWithAssistant(button, answerEl, {
    error: deviceProblem(device) || 'The light does not respond as expected.',
    context: assistantContext('The user is looking at the light list of the Elgato Key Lights plugin settings.'),
    device: assistantDevice(device),
    title: `Why does ${device.displayName || device.name || 'this light'} need attention?`,
  });
}

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

  // Confirm theme from Homebridge settings (overrides the early OS-preference detection)
  try {
    const settings = await homebridge.getUserSettings();
    const scheme = settings.colorScheme;
    if (scheme === 'dark' || scheme === 'light') {
      document.documentElement.dataset.bsTheme = scheme;
    } else if (scheme === 'auto') {
      document.documentElement.dataset.bsTheme =
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  } catch {
    // getUserSettings not available in older versions — keep the early-detected theme
  }

  await initAssistant();

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
function confirmRemove(index, btn) {
  const container = btn.parentElement;
  container.innerHTML = `
    <span class="small text-body-secondary me-1 d-none d-sm-inline">Remove?</span>
    <button class="btn btn-danger btn-sm me-1" onclick="event.stopPropagation(); removeDevice(${index})">Yes</button>
    <button class="btn btn-outline-secondary btn-sm" onclick="event.stopPropagation(); renderDevices(discoveredDevices)">No</button>
  `;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from HTML onclick
async function removeDevice(index) {
  const device = discoveredDevices[index];
  if (!device) {
    // Stale index (e.g. the list changed since the confirmation was shown)
    renderDevices(discoveredDevices);
    return;
  }
  const name = device.displayName || device.name;
  const remaining = discoveredDevices.filter((_, i) => i !== index);
  try {
    await saveDevicesToConfig(remaining);
    discoveredDevices = remaining;
    renderDevices(discoveredDevices);
    showToast(`Removed ${name}`, 'success');
  } catch (e) {
    console.error('[KeyLights] Failed to remove device:', e);
    renderDevices(discoveredDevices);
    showToast(`Remove failed: ${e.message}`, 'danger');
  }
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
  clearProblem('devices-problem');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Adding...';

  try {
    const result = await homebridge.request('/device/info', { host: ip, port });

    const deviceName = result.success ? (result.data?.displayName || result.data?.productName || `Key Light ${ip}`) : `Key Light ${ip}`;
    const model = result.success ? (result.data?.productName || 'Key Light') : 'Key Light';

    const newDevice = {
      name: deviceName,
      // The plugin keys devices by MAC and skips entries without one; current firmware
      // reports it in accessory-info
      mac: result.success ? (result.data?.macAddress || '') : '',
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
    if (!result.success) {
      showProblem('devices-problem', {
        message: `The light at ${ip}:${port} was added but did not answer: ${result.error || 'no response'}`,
        context: 'Adding a light manually by IP address and port in the plugin settings; the settings UI asked the light for /elgato/accessory-info with a 3 second timeout.',
        title: 'Why did the light not answer?',
        variant: 'warning',
      });
    }
  } catch (error) {
    showToast(`Failed to add device: ${error.message}`, 'danger');
    showProblem('devices-problem', {
      message: `Failed to add the light at ${ip}:${port}: ${error.message}`,
      context: 'Adding a light manually by IP address and port in the plugin settings failed.',
      title: 'Why did adding the light fail?',
    });
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-plus-circle me-1"></i>Add';
  }
}

async function discoverDevices() {
  const btn = document.getElementById('discoverBtn');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-discover me-1" role="status" aria-hidden="true"></span> Scanning...';
  clearProblem('devices-problem');

  try {
    const discovered = await homebridge.request('/discover');

    // Merge: update existing configured devices, add new ones
    const mergedDevices = mergeDevices(configuredDevices, discovered);
    discoveredDevices = mergedDevices;
    renderDevices(mergedDevices);

    // Report new devices not in config. They are only displayed, never saved
    // automatically — auto-saving here would silently re-add devices the user
    // just removed. They are persisted on the next explicit save action.
    const newDevices = discovered.filter(d =>
      !configuredDevices.some(c => c.mac === d.mac),
    );

    if (newDevices.length > 0) {
      showToast(`Found ${newDevices.length} new device(s)`, 'success');
    }
  } catch (error) {
    discoveredDevices = discoveredDevices.map(d => ({ ...d, online: false }));
    renderDevices(discoveredDevices);
    showToast('Discovery failed: ' + error.message, 'danger');
    showProblem('devices-problem', {
      message: `Discovery failed: ${error.message}`,
      context: 'The plugin settings ran a 5 second mDNS/Bonjour scan for _elg._tcp services from the Homebridge server and it failed.',
      title: 'Why did discovery fail?',
    });
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

  let pluginConfig = await homebridge.getPluginConfig();

  if (!pluginConfig || pluginConfig.length === 0) {
    // First-time setup: platform block not yet in config.json — create it
    pluginConfig = [{ platform: 'ElgatoKeyLights', name: 'Elgato Key Lights' }];
  }

  pluginConfig[0].devices = devicesToSave;
  await homebridge.updatePluginConfig(pluginConfig);
  await persistPluginConfig();
  configuredDevices = devicesToSave;
}

async function persistPluginConfig() {
  // homebridge-config-ui-x 5.24.0 relays savePluginConfig's result through
  // postMessage without awaiting it, which throws an uncaught DataCloneError in
  // the parent window: the save still executes, but the response never reaches
  // this frame. Race a timeout so the UI does not hang forever on the await.
  await Promise.race([
    homebridge.savePluginConfig(),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
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
    const hasProblem = assistantEnabled && !!deviceProblem(device);
    const explainButton = hasProblem
      ? MpKit.ai.renderButton({ label: 'Explain', size: 'sm', className: 'me-2 js-explain-device', title: 'Explain this light problem' })
        .replace('<button ', `<button onclick="event.stopPropagation(); explainDevice(${index}, this)" `)
      : '';
    const answerRow = hasProblem
      ? `<div class="list-group-item assistant-answer d-none" id="assistant-answer-${index}"></div>`
      : '';
    return `
        <div class="list-group-item mp-device-card d-flex justify-content-between align-items-center gap-2 py-3 ${isOffline ? 'opacity-50' : ''}" onclick="showSettingsView(${index})">
          <div class="d-flex align-items-center min-w-0">
            <div class="me-2 me-sm-3">
              <i class="bi bi-lightbulb-fill fs-3 ${isOffline ? 'text-secondary' : 'text-warning'}"></i>
            </div>
            <div class="min-w-0">
              <div class="d-flex flex-wrap align-items-center column-gap-2 row-gap-1">
                <span class="fw-semibold text-break">${escapeHtml(device.displayName || device.name)}</span>
                ${device.enabled === false ? MpKit.StatusBadge.disabled() : ''}
                ${statusBadge}
              </div>
              <div class="small text-body-secondary d-flex flex-wrap column-gap-3 mt-1">
                <span class="text-nowrap"><i class="bi bi-box me-1"></i>${escapeHtml(device.model || 'Key Light')}</span>
                <span class="text-nowrap"><i class="bi bi-ethernet me-1"></i>${escapeHtml(device.addresses?.[0] || device.ip || device.host || 'Unknown')}</span>
              </div>
            </div>
          </div>
          <div class="d-flex align-items-center flex-shrink-0">
            ${explainButton}
            <button class="btn btn-link text-body-secondary p-0 btn-touch" title="Remove device" aria-label="Remove device"
              onclick="event.stopPropagation(); confirmRemove(${index}, this)">
              <i class="bi bi-trash"></i>
            </button>
            <i class="bi bi-chevron-right text-body-secondary"></i>
          </div>
        </div>
        ${answerRow}
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
    <ul class="nav nav-tabs flex-nowrap mb-4" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" id="status-tab" data-bs-toggle="tab" data-bs-target="#status-pane" type="button" role="tab" aria-controls="status-pane" aria-selected="true">
          <i class="bi bi-activity me-1"></i> Status
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="settings-tab" data-bs-toggle="tab" data-bs-target="#settings-pane" type="button" role="tab" aria-controls="settings-pane" aria-selected="false">
          <i class="bi bi-gear me-1"></i> Settings
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="info-tab" data-bs-toggle="tab" data-bs-target="#info-pane" type="button" role="tab" aria-controls="info-pane" aria-selected="false">
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
                    <span class="text-body-secondary status-label">Power</span>
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
                    <span class="text-body-secondary status-label">Brightness</span>
                    <div class="flex-grow-1">
                      <div class="progress" style="height: 14px; background: linear-gradient(to right, #333 0%, #fff 100%); border-radius: 7px;">
                        <div class="progress-bar" role="progressbar" style="width: ${toNumber(currentState.brightness)}%; background: transparent; border-right: 3px solid var(--mp-primary);"></div>
                      </div>
                    </div>
                    <span class="fw-bold status-value">${toNumber(currentState.brightness)}%</span>
                  </div>
                </div>
              </div>
              <div class="row g-4">
                <div class="col-12">
                  <div class="d-flex align-items-center gap-3">
                    <span class="text-body-secondary status-label">Temperature</span>
                    <div class="flex-grow-1">
                      <div class="progress" style="height: 14px; background: linear-gradient(to right, #ff9329 0%, #fff 50%, #9fc5ff 100%); border-radius: 7px;">
                        <div class="progress-bar" role="progressbar" style="width: ${toNumber(tempPercent)}%; background: transparent; border-right: 3px solid var(--mp-primary);"></div>
                      </div>
                    </div>
                    <span class="fw-bold status-value">${kelvinTemp ? toNumber(kelvinTemp) + 'K' : 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="d-flex gap-2 flex-wrap align-items-center">
            <button class="btn btn-outline-secondary flex-fill flex-sm-grow-0 text-nowrap" onclick="identifyDevice(${currentDeviceIndex})">
              <i class="bi bi-stars me-1"></i> Identify
            </button>
            <button class="btn btn-outline-secondary flex-fill flex-sm-grow-0 text-nowrap" onclick="testConnection(${currentDeviceIndex})">
              <i class="bi bi-plug me-1"></i> Test Connection
            </button>
            <span id="testResult" class="ms-sm-2"></span>
          </div>
          <div id="device-problem" class="mt-3 d-none"></div>
        ` : `
          <div id="device-problem"></div>
        `}
      </div>

      <!-- Settings Tab -->
      <div class="tab-pane fade" id="settings-pane" role="tabpanel">
        <div class="card mp-settings-card mb-4">
          <div class="card-body">
            <div class="row g-4">

              <!-- Left column: Identity & behavior -->
              <div class="col-md-6">
                <div class="mb-4">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="deviceEnabled" ${device.enabled !== false ? 'checked' : ''}>
                    <label class="form-check-label" for="deviceEnabled">Enable this device in HomeKit</label>
                  </div>
                </div>

                <div class="mb-4">
                  <label class="form-label" for="displayName">Display Name</label>
                  <input type="text" class="form-control" id="displayName" value="${escapeHtml(device.displayName)}" placeholder="${escapeHtml(device.name)}">
                  <div class="form-text">Custom name to show in HomeKit (leave empty to use device name)</div>
                </div>

                <div class="mb-0">
                  <label class="form-label" for="powerOnBehavior">Power On Behavior</label>
                  <select class="form-select" id="powerOnBehavior">
                    <option value="${POWER_ON_BEHAVIOR.USE_GLOBAL}" ${device.powerOnBehavior === POWER_ON_BEHAVIOR.USE_GLOBAL || !device.powerOnBehavior ? 'selected' : ''}>Use global setting</option>
                    <option value="${POWER_ON_BEHAVIOR.RESTORE_LAST}" ${device.powerOnBehavior === POWER_ON_BEHAVIOR.RESTORE_LAST ? 'selected' : ''}>Restore last settings used</option>
                    <option value="${POWER_ON_BEHAVIOR.USE_DEFAULT}" ${device.powerOnBehavior === POWER_ON_BEHAVIOR.USE_DEFAULT ? 'selected' : ''}>Use default settings below</option>
                  </select>
                </div>
              </div>

              <!-- Right column: Default power-on values -->
              <div class="col-md-6">
                <h6 class="mp-label mb-1"><i class="bi bi-sliders2 me-2"></i>Default Power On Settings</h6>
                <p class="small text-body-secondary mb-4">Used when "Use default settings below" is selected.</p>

                <!-- Brightness Slider -->
                <div class="mb-4">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <label class="form-label mb-0">
                      <i class="bi bi-brightness-high me-2"></i>Brightness
                    </label>
                    <span class="slider-value" id="brightnessValue">${toNumber(device.powerOnBrightness, BRIGHTNESS_DEFAULT) || BRIGHTNESS_DEFAULT}%</span>
                  </div>
                  <div class="slider-container">
                    <input type="range" class="brightness-slider" id="powerOnBrightness"
                      min="${BRIGHTNESS_MIN}" max="${BRIGHTNESS_MAX}" value="${toNumber(device.powerOnBrightness, BRIGHTNESS_DEFAULT) || BRIGHTNESS_DEFAULT}"
                      oninput="updateBrightnessValue(this.value)">
                    <div class="slider-label">
                      <span>${BRIGHTNESS_MIN}%</span>
                      <span>${BRIGHTNESS_MAX}%</span>
                    </div>
                  </div>
                </div>

                <!-- Temperature Slider -->
                <div class="mb-0">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <label class="form-label mb-0">
                      <i class="bi bi-thermometer-half me-2"></i>Color Temperature
                    </label>
                    <span class="slider-value" id="temperatureValue">${toNumber(device.powerOnTemperature, TEMPERATURE_DEFAULT) || TEMPERATURE_DEFAULT}K</span>
                  </div>
                  <div class="slider-container">
                    <input type="range" class="temperature-slider" id="powerOnTemperature"
                      min="${TEMPERATURE_MIN}" max="${TEMPERATURE_MAX}" step="${TEMPERATURE_STEP}" value="${toNumber(device.powerOnTemperature, TEMPERATURE_DEFAULT) || TEMPERATURE_DEFAULT}"
                      oninput="updateTemperatureValue(this.value)">
                    <div class="slider-label">
                      <span>${TEMPERATURE_MIN}K (Warm)</span>
                      <span>${TEMPERATURE_MAX}K (Cool)</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        <div class="d-flex justify-content-sm-end gap-2">
          <button class="btn btn-secondary flex-fill flex-sm-grow-0" onclick="showListView()">Cancel</button>
          <button class="btn btn-primary flex-fill flex-sm-grow-0 text-nowrap" onclick="saveDeviceSettings(${currentDeviceIndex})">
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
                <div class="fw-medium">${escapeHtml(deviceInfo?.productName || device.model || 'Elgato Key Light')}</div>
              </div>
              <div class="col-md-6">
                <label class="mp-label mb-1">Serial Number</label>
                <div class="fw-medium font-monospace">${escapeHtml(deviceInfo?.serialNumber || 'Unknown')}</div>
              </div>
              <div class="col-md-6">
                <label class="mp-label mb-1">Firmware Version</label>
                <div class="fw-medium">${escapeHtml(deviceInfo?.firmwareVersion || 'Unknown')}</div>
              </div>
              <div class="col-md-6">
                <label class="mp-label mb-1">MAC Address</label>
                <div class="fw-medium font-monospace">${escapeHtml(device.mac || 'Unknown')}</div>
              </div>
              <div class="col-md-6">
                <label class="mp-label mb-1">IP Address</label>
                <div class="fw-medium font-monospace">${escapeHtml(host || 'Unknown')}</div>
              </div>
              <div class="col-md-6">
                <label class="mp-label mb-1">Port</label>
                <div class="fw-medium">${toNumber(device.port, ELGATO_DEFAULT_PORT) || ELGATO_DEFAULT_PORT}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (!currentState) {
    showProblem('device-problem', {
      message: device.online
        ? 'The light was found, but its status could not be read.'
        : 'Device is offline. Status unavailable.',
      context: 'The user opened the settings of one light; the settings UI could not read /elgato/accessory-info and /elgato/lights from it.',
      device: assistantDevice(device, deviceInfo),
      title: `Why is ${device.displayName || device.name || 'this light'} unavailable?`,
      variant: 'secondary',
      icon: 'bi-wifi-off',
    });
  }
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

  try {
    await saveDevicesToConfig(discoveredDevices);
    showToast('Device settings saved', 'success');
    document.getElementById('settingsDeviceName').textContent = device.displayName || device.name;
  } catch (e) {
    console.error('[KeyLights] Failed to save device settings:', e);
    showToast(`Save failed: ${e.message}`, 'danger');
  }
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
  clearProblem('device-problem');

  const showTestFailure = (message) => {
    resultSpan.innerHTML = `<span class="badge bg-danger"><i class="bi bi-x-circle me-1"></i>${escapeHtml(message)}</span>`;
    if (assistantEnabled) {
      showProblem('device-problem', {
        message: `Connection test failed: ${message}`,
        context: 'The user clicked Test Connection in the settings of one light; the settings UI requested /elgato/accessory-info with a 3 second timeout.',
        device: assistantDevice(device),
        title: 'Why did the connection test fail?',
      });
    }
  };

  try {
    const result = await homebridge.request('/device/test', { host, port: device.port || ELGATO_DEFAULT_PORT });
    if (result.success) {
      resultSpan.innerHTML = `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Connected (${toNumber(result.latency)}ms)</span>`;
    } else {
      showTestFailure(result.error || 'Connection failed');
    }
  } catch (error) {
    showTestFailure(error.message);
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
