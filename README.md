# Homebridge Elgato Key Lights

A [Homebridge](https://homebridge.io) plugin for controlling [Elgato Key Light](https://www.elgato.com/en/key-light) and [Key Light Air](https://www.elgato.com/en/key-light-air) devices via HomeKit.

[![npm](https://img.shields.io/npm/v/homebridge-elgato-key-lights)](https://www.npmjs.com/package/homebridge-elgato-key-lights)
[![npm](https://img.shields.io/npm/dt/homebridge-elgato-key-lights)](https://www.npmjs.com/package/homebridge-elgato-key-lights)
[![License](https://img.shields.io/npm/l/homebridge-elgato-key-lights)](LICENSE)

## Features

- Automatic discovery of Elgato Key Lights on your network via mDNS/Bonjour
- Control power, brightness, and color temperature from HomeKit
- Real-time state synchronization with polling
- Configure power-on behavior and default settings
- Custom UI for device management in Homebridge Config UI X

## Requirements

- Node.js v20 or later
- Homebridge v1.8.0 or later

## Installation

### Via Homebridge Config UI X (Recommended)

1. Open Homebridge Config UI X
2. Navigate to the Plugins tab
3. Search for `homebridge-elgato-key-lights`
4. Click Install

### Via npm

```bash
npm install -g homebridge-elgato-key-lights
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
      "useIP": false
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
