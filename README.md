# Homebridge Elgato Key Lights

A [Homebridge](https://homebridge.io) plugin for controlling [Elgato Key Light](https://www.elgato.com/en/key-light) and [Key Light Air](https://www.elgato.com/en/key-light-air) devices via HomeKit.

[![npm](https://img.shields.io/npm/v/@mp-consulting/homebridge-elgato-key-lights)](https://www.npmjs.com/package/@mp-consulting/homebridge-elgato-key-lights)
[![npm](https://img.shields.io/npm/dt/@mp-consulting/homebridge-elgato-key-lights)](https://www.npmjs.com/package/@mp-consulting/homebridge-elgato-key-lights)
[![License](https://img.shields.io/npm/l/@mp-consulting/homebridge-elgato-key-lights)](LICENSE)

## Features

- Automatic discovery of Elgato Key Lights on your network via mDNS/Bonjour
- Control power, brightness, and color temperature from HomeKit
- Real-time state synchronization with polling
- Configure power-on behavior and default settings
- Custom UI for device management in Homebridge Config UI X
- **Assistant (optional)** - Explains discovery, connection and offline-light problems in the config UI, using the AI provider you set up in Homebridge AI Kit

## Requirements

- Node.js v22 or later
- Homebridge v1.8.0 or later

## Installation

### Via Homebridge Config UI X (Recommended)

1. Open Homebridge Config UI X
2. Navigate to the Plugins tab
3. Search for `@mp-consulting/homebridge-elgato-key-lights`
4. Click Install

### Via npm

```bash
npm install -g @mp-consulting/homebridge-elgato-key-lights
```

## Configuration

### Basic Configuration

Add the platform to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "ElgatoKeyLights",
      "name": "Elgato Key Lights"
    }
  ]
}
```

That's it! The plugin will automatically discover all Elgato Key Lights on your network.

### Advanced Configuration

```json
{
  "platforms": [
    {
      "platform": "ElgatoKeyLights",
      "name": "Elgato Key Lights",
      "pollingRate": 1000,
      "powerOnBehavior": 1,
      "powerOnBrightness": 20,
      "powerOnTemperature": 4695,
      "switchOnDurationMs": 100,
      "switchOffDurationMs": 300,
      "colorChangeDurationMs": 100,
      "useIP": false,
      "devices": [
        {
          "mac": "AA:BB:CC:DD:EE:FF",
          "displayName": "Desk Light"
        },
        {
          "mac": "11:22:33:44:55:66",
          "displayName": "Studio Key Light"
        }
      ]
    }
  ]
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | `"Elgato Key Lights"` | Plugin name displayed in Homebridge logs |
| `pollingRate` | integer | `1000` | How often to poll light status (milliseconds) |
| `powerOnBehavior` | integer | `1` | `1` = Restore last settings, `2` = Restore defaults |
| `powerOnBrightness` | integer | `20` | Default brightness when powered on (0-100%) |
| `powerOnTemperature` | integer | `4695` | Default color temperature (2900-7000K) |
| `switchOnDurationMs` | integer | `100` | Fade-in duration when turning on (ms) |
| `switchOffDurationMs` | integer | `300` | Fade-out duration when turning off (ms) |
| `colorChangeDurationMs` | integer | `100` | Transition duration for color changes (ms) |
| `useIP` | boolean | `false` | Use IP address instead of hostname for connections |
| `devices` | array | `[]` | Per-device configuration (see below) |

### Per-Device Configuration

The `devices` array allows you to customize individual lights:

| Option | Type | Description |
|--------|------|-------------|
| `mac` | string | MAC address of the device |
| `displayName` | string | Custom display name for HomeKit |

You can find the MAC address in Homebridge logs when a device is discovered.

## Supported Devices

- Elgato Key Light
- Elgato Key Light Air
- Elgato Key Light Mini
- Elgato Ring Light

Any device advertising the `_elg._tcp` mDNS service should work.

## Troubleshooting

### Lights not discovered

1. Ensure your lights are on the same network as your Homebridge server
2. Check that mDNS/Bonjour traffic is not blocked by your router or firewall
3. Try enabling the `useIP` option if you have DNS resolution issues

### Connection issues

If you experience intermittent connection problems:

1. Try setting `useIP: true` in your configuration
2. Assign static IP addresses to your lights via your router's DHCP settings
3. Reduce the `pollingRate` if your network is congested

### Lights not responding

1. Restart the Elgato Control Center app on your computer
2. Power cycle your Key Light
3. Check the Homebridge logs for error messages

## Assistant

The config UI can explain problems with the **Assistant**. It is off until you set up
an AI provider once for all MP Consulting plugins in
[Homebridge AI Kit](https://github.com/mp-consulting/homebridge-ai-kit) (or the
Homebridge Glass UI): the plugin reads the shared `HomebridgeAiKit` platform block from
`config.json` and has no AI settings of its own. When it is not set up, the UI looks
exactly as before, with a small tip under the light list.

When it is enabled, **Explain** buttons appear next to a failed discovery, a light added
by IP that did not answer, every light that is offline or has no MAC address, an
unavailable light's status, and a failed **Test Connection**. The answer streams into an
Assistant panel below.

What is sent to the provider: the error message (with IP addresses, MAC addresses and
`.local` hostnames masked), the `useIP` and polling-rate settings, the number of
configured lights, and for a light its name, model, firmware version, port, power-on
behaviour and online/enabled/has-MAC flags. IP addresses, hostnames, MAC addresses and
serial numbers are never sent, and the provider's API key stays on the Homebridge server.

The light settings are edited per light in the custom UI, so there is no
"Describe Your Setup" config assistant in this plugin.

## Development

```bash
# Clone the repository
git clone https://github.com/mp-consulting/homebridge-elgato-key-lights.git
cd homebridge-elgato-key-lights

# Install dependencies
npm install

# Build
npm run build

# Watch mode (for development)
npm run watch

# Lint
npm run lint
```

The build vendors `@mp-consulting/homebridge-ui-kit` and Bootstrap into
`homebridge-ui/public/lib/` with `mp-ui-kit-copy --vendor`. Until
`@mp-consulting/homebridge-ai-kit` 2.0.0 and `@mp-consulting/homebridge-ui-kit` 1.2.0
are published, both are installed from sibling checkouts (`file:../homebridge-mcp-server`
and `file:../homebridge-ui-kit`); they must become `^2.0.0` and `^1.2.0` before release.

## Project Structure

```
src/
├── index.ts                         # Entry point
├── types/                           # TypeScript interfaces
├── config/                          # Constants and settings
├── platform/                        # Platform and device catalog
├── accessories/                     # HomeKit accessory handlers
└── devices/                         # Device API clients
```

## License

[MIT](LICENSE)

## Credits

Originally forked from [homebridge-keylights](https://github.com/derjayjay/homebridge-keylights) by derjayjay.
