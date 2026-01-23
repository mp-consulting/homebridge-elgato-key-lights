# Accessories

This folder contains HomeKit accessory handlers that bridge Homebridge/HomeKit characteristics to the physical Elgato Key Light devices.

## Files

### KeyLightsAccessory.ts

The `KeyLightsAccessory` class is the HomeKit accessory handler for individual Key Light devices. Each discovered light gets its own instance of this class.

**Responsibilities:**

- Registers and manages the `Lightbulb` service with HomeKit
- Handles characteristic get/set operations:
  - **On/Off** - Power state control
  - **Brightness** - Light intensity (0-100%)
  - **ColorTemperature** - Color temperature in mirek (143-344)
- Sets accessory information (manufacturer, model, serial number, firmware version)
- Listens for external property changes and updates HomeKit accordingly
- Handles the "Identify" accessory action (flashes the light)

**Key Methods:**

- `setOn/getOn` - Power state handlers
- `setBrightness/getBrightness` - Brightness handlers
- `setColorTemperature/getColorTemperature` - Color temperature handlers
- `onPropertyChanged` - Callback for external state changes
- `updateConnectionData` - Updates device connection info when IP changes
