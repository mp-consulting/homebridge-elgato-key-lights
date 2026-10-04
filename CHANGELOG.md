# Changelog

## [Unreleased] - 1.1.0

### Added

- **Assistant in the config UI.** When an AI provider is set up in Homebridge AI Kit (the shared `HomebridgeAiKit` platform block), an **Explain** button appears next to a failed discovery, a light added by IP that did not answer, lights that are offline or have no MAC address, an unavailable light's status and a failed connection test. The explanation streams into an Assistant panel, with Key Light context (mDNS `_elg._tcp`, HTTP API on port 9123, `useIP`, polling and the usual network errors). Only the error (IP/MAC/hostnames masked), the `useIP`/polling settings and non-sensitive light facts (name, model, firmware, port, flags) are sent: never IP addresses, hostnames, MAC addresses or serial numbers. Without the AI Kit nothing changes, apart from a small tip under the light list.
- `homebridge-ui/server.js` registers the `/ai/status`, `/ai/explain`, `/ai/ask` and `/ai/config` routes with `registerAiRoutes` from `@mp-consulting/homebridge-ai-core/plugin` (new runtime dependency: the slim core of Homebridge AI Kit, so the plugin does not pull in the MCP SDK, socket.io or zod).

### Changed

- **UI assets are vendored with `mp-ui-kit-copy --vendor`** from `@mp-consulting/homebridge-ui-kit` 1.2.0 instead of a hand-written copy script; `homebridge-ui/public/lib/` keeps the same layout and now also contains `ai.css`.

### Release blockers

- `@mp-consulting/homebridge-ai-core` (`file:../homebridge-mcp-server/packages/ai-core`) and `@mp-consulting/homebridge-ui-kit` (`file:../homebridge-ui-kit`) are local, unpublished checkouts. Change them to `^2.0.0` and `^1.2.0` once published, and regenerate `package-lock.json`.

## [1.0.30] - 2026-10-03

### Changed

- **Dependabot is enabled.** It opens pull requests for outdated npm dependencies (weekly) and GitHub Actions (monthly), and GitHub now alerts on and fixes vulnerable dependencies. The plugin itself is unchanged.

## [1.0.29] - 2026-10-03

### Changed

- **Support footer rendered by the UI kit**: the GitHub / npm links at the bottom of the config UI are now drawn by `MpKit.Footer.render` instead of hand-written markup, so every @mp-consulting plugin shows the same links, separators and icons.
- **`@mp-consulting/homebridge-ui-kit` 1.1.0**: helper output is HTML-escaped, settings cards and tab borders are visible in the light theme, the active tab keeps WCAG AA contrast in dark mode, and the footer icons are inline SVG so they no longer depend on an icon font.

## [1.0.28] - 2026-10-03

### Security

- **Config UI escaped device-supplied text**: device names, models and info from mDNS announcements and device HTTP responses were interpolated into `innerHTML` unescaped, so anything on the LAN advertising an `_elg._tcp` service could inject script into the Homebridge admin UI. All such values are now escaped.
- **Config UI server validates device addresses**: `/device/*` requests now only accept a plain IP or hostname and a port in 1–65535 before building the device URL. The unused `/device/settings/update` route, which forwarded an arbitrary body to any host, was removed.
- **ARP lookups run without a shell** (`execFile` instead of `exec`).

### Fixed

- **Requests to an unresponsive light could hang forever**: initialization, set, settings and identify requests now time out after 5 s, so HomeKit gets an error instead of a stuck "Updating…".
- **Same light keyed twice when its MAC was written differently** in `config.json` and mDNS (e.g. `3c-6a-…` vs `3C:6A:…`), leading to two pollers and a duplicate accessory registration. MACs are now normalized everywhere.
- **ARP resolution failed on macOS for MACs with a leading-zero octet**, because `arp -a` prints `3c:6a:9d:4:a:b`.
- **2900 K power-on temperature** converted to 345 mirek, one above what the light accepts; it is now clamped.
- **IPv6 addresses** produced invalid URLs; they are now bracketed, and `useIP` prefers an IPv4 address.
- **Lights without a serial number** all shared one accessory UUID; the MAC is now used as a fallback.
- **Manually added lights in the config UI were never loaded**, as they were saved without a MAC; the MAC is now taken from the light's `accessory-info`.
- mDNS services without a device id are ignored instead of colliding under an empty key.

### Changed

- **HomeKit shows "No Response"** after three consecutive failed polls instead of stale values, and the log reports when a light stops and starts responding again.
- **Polls no longer overlap**: the next poll is scheduled only after the previous one settles. `pollingRate` is clamped to at least 250 ms.
- Successful writes update the cached state immediately, so reads before the next poll are correct and the poll no longer echoes the change back to HomeKit.
- Accessories of lights disabled in config are removed from HomeKit at startup.
- Characteristic handlers use `onGet`/`onSet` instead of the deprecated callback events.
- **Config UI works on phones**: the Devices toolbar no longer wraps its buttons, the manual-add form stacks the IP field above port and buttons, long device names wrap or clamp to two lines instead of pushing badges and actions aside, the status card no longer breaks "Temperature" mid-word, icon buttons have 44px touch targets, and action buttons span the width on small screens.
- The device catalog's online/offline state now follows polling reachability; an mDNS re-announcement alone no longer marks a light online. Unused catalog lookup methods were removed.

### Removed

- Unused runtime dependencies `homebridge-lib` and `class-validator`, which were installed for every user but never imported.

## [1.0.27] - 2026-09-10

### Fixed

- **404s in the browser console on every visit to the settings page** ([#55](https://github.com/mp-consulting/homebridge-elgato-key-lights/pull/55)): the vendored minified Bootstrap files kept their trailing `sourceMappingURL` comment, so the browser asked for `bootstrap.min.css.map` and `bootstrap.bundle.min.js.map` and got a 404 for each. The copy step now strips the comment instead of shipping ~920 kB of source maps.

### Changed

- **Dependencies**: Updated all dependencies to latest compatible versions, including `axios` ^1.20.0, `homebridge-lib` ^8.1.5, `bonjour-service` ^1.4.4 and `@homebridge/plugin-ui-utils` ^2.2.6, plus dev-only major bumps for `vitest` (4→5) and `@types/node` (25→26).

## [1.0.26] - 2026-08-09

### Fixed

- **Config UI rendered unstyled and its controls did nothing**: Bootstrap and Bootstrap Icons were loaded from `cdn.jsdelivr.net`, which the Homebridge UI's content-security policy refuses. Both stylesheets and the script were blocked, so the page lost its styling and `bootstrap` was never defined, leaving tabs, modals and collapses inert. All three are now vendored into the plugin and served from it, alongside the icon font.

## [1.0.25] - 2026-08-09

### Changed

- **Node.js support is now `^22.10.0 || ^24.0.0 || ^26.0.0`**: adds Node 26, which Homebridge 2.3.0 supports as of this release, and drops Node 20. Homebridge 2.x has never accepted Node 20 (it has required `^22 || ^24` since 2.0.0), so the previous range advertised a combination that could not actually run. CI now builds on Node 22.x, 24.x and 26.x.

## [1.0.20] - 2026-04-17

### Fixed

- **Publish workflow**: Bump Node to 24 in `publish.yml` — aligns with other homebridge plugin repos and unblocks the `npm install -g npm@latest` step that failed on the Node 22 runner

## [1.0.19] - 2026-04-17

### Changed

- **Dependencies**: Updated all dependencies to latest versions, including major bump for `homebridge-lib` (7→8)

## [1.0.18] - 2026-04-04

### Changed

- **Docs**: Update CLAUDE.md

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
