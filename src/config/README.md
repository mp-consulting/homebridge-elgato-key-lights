# Config

This folder contains plugin configuration constants and settings used throughout the codebase.

## Files

### settings.ts

Defines the plugin identity constants:

- `PLATFORM_NAME` - The platform name used in Homebridge config (`ElgatoKeyLights`)
- `PLUGIN_NAME` - The npm package name (`homebridge-keylights`)

### constants.ts

Shared constants for the plugin:

- `BONJOUR_SERVICE_TYPE` - mDNS service type for Elgato device discovery (`elg`)
- `API_PATHS` - Elgato device REST API endpoint paths
- `COLOR_TEMPERATURE` - HomeKit color temperature range in mirek (143-344)
- `DEFAULT_POLLING_RATE_MS` - Default state polling interval (1000ms)
- `KELVIN_TO_MIREK_FACTOR` - Conversion factor for Kelvin to mirek (1,000,000)

## Usage

Import constants as needed:

```typescript
import { PLATFORM_NAME, PLUGIN_NAME } from './config/settings.js';
import { API_PATHS, COLOR_TEMPERATURE } from './config/constants.js';
```
