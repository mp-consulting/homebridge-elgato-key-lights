# Platform

This folder contains the main Homebridge platform plugin implementation and device registry.

## Files

### KeyLightsPlatform.ts

The main platform plugin class that implements `DynamicPlatformPlugin`. This is the entry point for the Homebridge integration.

**Responsibilities:**

- Registers the platform with Homebridge
- Discovers Elgato devices on the network via mDNS/Bonjour
- Manages cached accessories from previous sessions
- Creates and configures `KeyLightsAccessory` instances for discovered devices
- Handles platform shutdown gracefully

**Key Methods:**

- `startDiscovery()` - Starts mDNS discovery for Elgato devices
- `stopDiscovery()` - Stops mDNS discovery
- `configureAccessory()` - Restores cached accessories from disk
- `configureDevice()` - Creates HomeKit accessory for a discovered device

### DeviceCatalog.ts

A centralized registry for managing all Key Light devices throughout their lifecycle.

**Responsibilities:**

- Tracks device state: `discovered` → `initializing` → `online` / `offline` / `error`
- Stores references to device instances and accessory handlers
- Provides lookup methods by MAC address
- Manages device lifecycle (registration, updates, removal)
- Handles graceful shutdown of all devices

**Key Methods:**

- `registerDiscovery(device)` - Register a newly discovered device
- `registerInstance(mac, instance)` - Register an initialized device instance
- `registerAccessory(mac, accessory)` - Register a HomeKit accessory handler
- `updateConnectionData(mac, device)` - Update connection info on rediscovery
- `markOffline(mac)` / `markError(mac)` - Update device state
- `shutdown()` - Stop all devices and clear the catalog
