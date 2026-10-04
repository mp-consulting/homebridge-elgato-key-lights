import { registerAiRoutes } from '@mp-consulting/homebridge-ai-kit/plugin';

/**
 * Elgato Key Light background the Assistant gets with every request from this
 * plugin's settings UI. Keep it short: it is sent with each prompt.
 */
export const KEY_LIGHTS_AI_CONTEXT = [
  'The plugin bridges Elgato Key Light and Key Light Air panels to HomeKit. It is local only: there is no cloud,',
  'account or password. Lights are found over mDNS/Bonjour (service type _elg._tcp, TXT "id" = MAC address, "md" =',
  'model) and controlled through their HTTP API on port 9123 (/elgato/accessory-info, /elgato/lights,',
  '/elgato/lights/settings, /elgato/identify). Devices are keyed by MAC address: discovered services without an id',
  'are ignored, and configured devices without a MAC and an IP or hostname are skipped. Devices can also be added',
  'manually by IP and port; configured devices are registered even when mDNS fails (Docker or other containers',
  'without host networking, VLANs, multicast filtering, client isolation). By default the plugin connects to the',
  '.local hostname, resolved by DNS and then the ARP table; "useIP" makes it use the announced IP address instead,',
  'which helps when .local resolution fails. A DHCP reservation keeps the IP stable. The plugin polls /elgato/lights',
  'every "pollingRate" ms (default 1000, minimum 250); after 3 failed polls in a row it logs "is not responding,',
  'will keep retrying" and shows the light as not responding until a poll succeeds. "Device initialization failed"',
  'means the first info/lights/settings requests failed (5 s timeout). The settings UI scans mDNS for 5 s and tests',
  'lights with a 3 s HTTP timeout: "timeout of 3000ms exceeded" or ETIMEDOUT means no answer (light off, asleep,',
  'weak Wi-Fi, wrong IP), ECONNREFUSED means something else answered at that address, EHOSTUNREACH means the',
  'address is not reachable from Homebridge (other subnet or VLAN). Closing or restarting the Elgato Control',
  'Center app and power cycling the light are common fixes. Power-on behaviour: 1 restores the last state, 2 uses',
  'the default brightness (3-100 %) and colour temperature (2900-7000 K, 143-344 mirek); per device, 0 uses the',
  'global setting. Never ask the user for passwords, tokens or API keys.',
].join(' ');

export const ASSISTANT_PLUGIN_NAME = '@mp-consulting/homebridge-elgato-key-lights';

/**
 * Adds the Assistant routes (/ai/status, /ai/explain, /ai/ask, /ai/config) to the
 * plugin UI server. The provider settings come from the shared `HomebridgeAiKit`
 * block in config.json; the key never reaches the browser.
 *
 * `options` is passed through to `registerAiRoutes` (tests inject a provider).
 */
export function registerAssistant(server, options = {}) {
  registerAiRoutes(server, {
    pluginName: ASSISTANT_PLUGIN_NAME,
    systemContext: KEY_LIGHTS_AI_CONTEXT,
    ...options,
  });
}
