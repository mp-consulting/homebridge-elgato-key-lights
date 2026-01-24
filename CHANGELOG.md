# Changelog

## [1.0.4] - 2026-01-24

### Added

- Per-device configuration via `devices` array in config.json
- Custom device names can be set using MAC address or serial number as identifier
- Device names from config are used for HomeKit display via ConfiguredName characteristic

---

## [1.0.3] - 2026-01-23

### Added

- ConfiguredName characteristic for better device name display in HomeKit

---

## [1.0.2] - 2026-01-23

### Fixed

- Color temperature values outside HomeKit range (140 mirek) now clamped to valid range (143-344)

### Changed

- Removed magic numbers, replaced with named constants in `constants.ts`
- Added `clampColorTemperature` utility function for consistent temperature clamping
- Added `DEFAULT_DEVICE_SETTINGS` constants for device configuration defaults
- Added `ARP_TIMEOUT_MS` and `MAX_IPV4_OCTET` constants

### Added

- 12 new unit tests for constants and clampColorTemperature function

---

## [1.0.1] - 2026-01-23

### Added

- ARP-based IP resolution when mDNS `.local` hostname resolution fails
- Cross-platform support for ARP lookup (macOS, Linux, Windows)
- IP address caching in device catalog for faster reconnection
- Resolved IP persisted to accessory context for use across restarts
- New `dns-resolver` utility module for hostname resolution
- Unit tests for DNS resolver (12 tests) and DeviceCatalog (11 tests)

### Fixed

- Device initialization failing with `getaddrinfo ENOTFOUND` for `.local` hostnames
- Device reconnection now uses cached IP instead of re-resolving `.local` hostname

---

## [2.0.0] - 2026-01-22

### Changed

- **Breaking:** Requires Node.js v20 or later
- **Breaking:** Requires Homebridge v1.8.0 or later
- Complete codebase refactor with improved architecture
- Reorganized project structure into logical modules:
  - `types/` - All TypeScript interfaces and type definitions
  - `config/` - Constants and plugin settings
  - `platform/` - Platform plugin and device catalog
  - `accessories/` - HomeKit accessory handlers
  - `devices/` - Device API communication
- Converted from unsafe declaration merging to proper class implementation
- Migrated from nested Promise chains to async/await
- Parallel device initialization for faster startup
- Centralized constants for magic numbers and API paths
- Improved error handling with detailed error messages
- Fixed filename typo (`keyLightsPlatfom.ts` → `keyLightsPlatform.ts`)

### Added

- `DeviceCatalog` class for centralized device lifecycle management
- Device state tracking (discovered, initializing, online, offline, error)
- Proper TypeScript types for all light properties
- `LightProperty` type for type-safe property access
- Shared `PropertyChangedCallback` type
- Unit testing infrastructure with Vitest
- Test coverage for `KeyLightInstance` (98.6%) and constants (100%)
- Mock helpers for Homebridge API and axios
- Test data factories for KeyLight fixtures
- Modernized Homebridge UI with device management

### Changed

- Package name changed to `@mp-consulting/homebridge-elgato-key-lights` (scoped)

### Fixed

- Error messages now include actual error details instead of being swallowed
- `manufacturer` getter now handles product names without spaces correctly

---

## [1.2.4]

Bumped some package versions

## [1.2.3]

Bumped some package versions

## [1.2.2]

Bumped some package versions

## [1.2.1]

Added more keywords

## [1.2.0]

Fixed a bug where the mDNS referrer was used instead of the hostname. Added an option to switch between using the hostname and the IP address of the lights.

## [1.1.0]

Plugin is now verified by Homebridge. Optional settings no longer have a default value (making them non-optional), but use a placeholder.

## [1.0.2]

Lowered required Node version to maintenance LTS (i.e. Node.js v10)

## [1.0.1]

Added CHANGELOG.md

## [1.0.0]

Implemented changing of device settings

## [0.1.1]

Added README.md with basic configuration

## [0.1.0]

First implementation
