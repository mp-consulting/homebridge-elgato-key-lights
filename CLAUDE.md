# CLAUDE.md

## Project Overview

Homebridge plugin (`@mp-consulting/homebridge-elgato-key-lights`) for Elgato Key Light and Key Light Air devices. Provides automatic mDNS discovery, power/brightness/color temperature control, and real-time state synchronization via polling.

## Tech Stack

- **Language**: TypeScript (strict, ES2022, ESM via NodeNext)
- **Runtime**: Node.js ^20 || ^22 || ^24, Homebridge ^1.8.0 || ^2.0.0-beta
- **Testing**: Vitest with UI and coverage
- **Linting**: ESLint 9 flat config with typescript-eslint
- **Key deps**: `axios` (HTTP), `bonjour-service` (mDNS discovery), `homebridge-lib`

## Commands

- `npm run build` — Compile TypeScript to `dist/`
- `npm run lint` — Lint with zero warnings
- `npm test` — Run tests (Vitest)
- `npm run test:coverage` — Tests with coverage
- `npm run test:ui` — Vitest UI dashboard
- `npm run watch` — Build, link, and watch with nodemon

## Project Structure

```
src/
├── index.ts                    # Plugin entry point
├── accessories/
│   └── KeyLightsAccessory.ts   # HomeKit accessory (power, brightness, color temp)
├── devices/
│   └── KeyLightInstance.ts     # Device instance with HTTP API communication
├── platform/
│   ├── KeyLightsPlatform.ts    # Main platform (mDNS discovery, accessory lifecycle)
│   └── DeviceCatalog.ts        # Centralized device state management
├── config/
│   ├── constants.ts            # API paths, defaults, mirek/kelvin ranges
│   └── settings.ts             # Plugin/platform name exports
├── types/                      # Shared interfaces
└── utils/
    └── dns-resolver.ts         # Hostname resolution utilities
test/
├── unit/                       # Unit tests
├── fixtures/                   # Test data
└── mocks/                      # Axios and Homebridge mocks
homebridge-ui/                  # Custom config UI
```

## Architecture

- **DynamicPlatformPlugin** with mDNS-based auto-discovery (`elg` service type)
- **DeviceCatalog** tracks device states (online, offline, initializing, error)
- **Polling-based sync** with configurable interval (default 1000ms)
- **Mirek/Kelvin conversion** for HomeKit color temperature (143-344 mirek)
- **Per-device config** overrides via MAC address matching

## Code Style

- Single quotes, 2-space indent, semicolons required
- Trailing commas in multiline, max line length 160
- Unix line endings, object curly spacing

## Git Settings

- `coAuthoredBy`: false
