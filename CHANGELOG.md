# Changelog

## [1.0.17] - 2026-03-30

### Changed

- **Dependencies**: Add `class-validator` as a direct dependency for `homebridge-config-ui-x` compatibility
- **Node.js**: Standardize `.tool-versions` to Node 20.22.2

## [1.0.16] - 2026-03-30

### Fixed

- ESLint 10 lint + TypeScript 6 module resolution

## [1.0.10] - 2026-03-30

### Changed

- **Dependencies**: Updated all dependencies to latest versions including `@homebridge/plugin-ui-utils` ^2.2.3, `axios` ^1.14.0, `homebridge-lib` ^7.3.2, `eslint` ^10.1.0, `typescript` ^6.0.2, `vitest` ^4.1.2, and other dev dependencies.

## [1.0.9] - 2026-03-05

### Changed

- Removed "Homebridge" prefix from `displayName`

## [1.0.8] - 2026-03-05

### Fixed

- **Config UI save to config.json**: `saveDevicesToConfig` was silently doing nothing when `homebridge.getPluginConfig()` returned an empty array (plugin installed but platform block not yet in config.json), while still showing a success toast. Now creates the initial platform config block on first save. Errors now propagate correctly so the success toast only fires on an actual successful save.
- **Nav tabs active indicator**: Replaced fragile `border-bottom-color: var(--bs-body-bg)` background-matching approach with a `position: absolute; top: 100%` `::after` pseudo-element. Positioned descendants paint after their ancestor's border in CSS paint order, so the opaque primary-coloured strip reliably covers the grey tab bar border regardless of the Homebridge iframe background.
- **Manual add Cancel button**: Added a Cancel button next to Add in the manual IP entry form.

### Changed

- Settings tabs now use Bootstrap's native `nav-tabs` component (previously custom `mp-tabs`).

## [1.0.7] - 2026-03-05

### Fixed

- **Config UI light mode**: Hardcoded `data-bs-theme="dark"` broke layout in light mode (dark cards on white background). Added early inline theme detection from `window.matchMedia` and confirmed via `homebridge.getUserSettings()` after ready.
- **Slider visibility in light mode**: Slider tracks ending in `#fff` were invisible against white background. Changed to `#e8e8e8` and added a subtle `box-shadow` border so tracks are visible in both light and dark mode.

## [1.0.6] - 2026-03-04

### Added

- New branded config UI using `@mp-consulting/homebridge-ui-kit` design system
- Manual device entry by IP address and port (for devices on different subnets)
- Remove device button with inline confirmation in device list
- Settings tab split into two columns (identity/behavior left, default power-on values right)

### Fixed

- Config UI iframe blocked `window.confirm()` — replaced with inline Yes/No buttons

### Changed

- Unified tooling: Vitest v4, ESLint flat config, nodemon
- Standardized `.gitignore` and `.npmignore`

---

## [1.0.5] - 2026-01-24

### Fixed

- Device config now uses `mac` and `displayName` fields to match expected config format

---

## [1.0.4] - 2026-01-24

### Added

- Per-device configuration via `devices` array in config.json
- Custom device names can be set using MAC address as identifier
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
