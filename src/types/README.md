# Types

This folder contains shared TypeScript type definitions and interfaces used throughout the plugin.

## Files

### index.ts

Exports all shared types and interfaces:

**Type Aliases:**

- `LightProperty` - Union type for light properties: `'brightness' | 'on' | 'temperature'`
- `PropertyChangedCallback` - Callback signature for property change notifications
- `DeviceState` - Device lifecycle states: `'discovered' | 'initializing' | 'online' | 'offline' | 'error'`

**Interfaces:**

- `KeyLight` - Basic device connection information from mDNS discovery
  - `hostname`, `port`, `name`, `mac`

- `KeyLightSettings` - Device power-on and transition settings
  - `powerOnBehavior`, `powerOnBrightness`, `powerOnTemperature`
  - `switchOnDurationMs`, `switchOffDurationMs`, `colorChangeDurationMs`

- `KeyLightInfo` - Device information from the accessory-info endpoint
  - `productName`, `serialNumber`, `displayName`, `firmwareVersion`, etc.

- `KeyLightOptions` - Light state from the lights endpoint
  - `numberOfLights`, `lights[]` (on, brightness, temperature)

## Usage

Import types as needed:

```typescript
import { KeyLight, KeyLightSettings, LightProperty } from './types/index.js';
```
