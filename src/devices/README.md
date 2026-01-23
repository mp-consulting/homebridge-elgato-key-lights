# Devices

This folder contains device communication and state management classes for Elgato Key Light hardware.

## Files

### KeyLightInstance.ts

The `KeyLightInstance` class represents an initialized Key Light device. It handles all direct communication with the physical device via its REST API.

**Responsibilities:**

- Communicates with the device's HTTP REST API
- Manages device state (on/off, brightness, temperature)
- Polls the device for state changes at a configurable interval
- Notifies listeners when properties change externally (e.g., via the Elgato app)
- Handles device identification (flash)
- Updates device settings (power-on behavior, transition durations)

**Factory Method:**

```typescript
const instance = await KeyLightInstance.createInstance(keyLight, log, pollingRate);
```

**Key Properties:**

- `hostname`, `port` - Device network address
- `name`, `mac` - Device identification
- `info` - Device info (serial, firmware, product name)
- `options` - Current light state (on, brightness, temperature)
- `settings` - Device settings (power-on behavior, transitions)

**Key Methods:**

- `setProperty(property, value)` - Set a light property
- `getProperty(property)` - Get a light property value
- `identify()` - Flash the light for identification
- `updateSettings(settings)` - Update device settings
- `stopPolling()` - Stop state polling (called during shutdown)
