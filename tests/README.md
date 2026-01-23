# Test Suite

Unit and integration tests for the Homebridge Elgato Key Lights plugin.

## Setup

Install dependencies:

```bash
npm install
```

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with interactive UI
npm run test:ui
```

## Directory Structure

```
tests/
├── unit/                    # Unit tests for individual classes/functions
│   ├── KeyLightInstance.test.ts
│   └── constants.test.ts
├── integration/             # Integration tests (device discovery, API flows)
├── mocks/                   # Mock implementations
│   ├── homebridge.ts        # Homebridge API mocks (Logger, Service, etc.)
│   └── axios.ts             # HTTP client mocks
├── fixtures/                # Test data factories
│   └── keylight.ts          # KeyLight data generators
└── README.md
```

## Architecture

### Mocks

Located in `tests/mocks/`:

- **homebridge.ts**: Mock implementations for Homebridge APIs
  - `createMockLogger()` - Mock Logger for capturing log output
  - `createMockService()` - Mock Service with characteristic handling
  - `createMockAccessory()` - Mock PlatformAccessory
  - `createMockAPI()` - Mock Homebridge API

- **axios.ts**: HTTP client mocking utilities
  - `createAxiosResponse()` - Create mock Axios responses
  - `setupKeyLightApiMock()` - Configure mocks for Key Light API endpoints

### Fixtures

Located in `tests/fixtures/`:

- **keylight.ts**: Factory functions for test data
  - `createKeyLight()` - Basic device connection info
  - `createKeyLightInfo()` - Device information response
  - `createKeyLightOptions()` - Light state response
  - `createKeyLightSettings()` - Device settings response

### Writing Tests

1. **Unit Tests** (`tests/unit/`): Test individual classes in isolation
   - Mock all external dependencies (axios, homebridge)
   - Use fake timers for polling tests
   - Clean up resources in `afterEach`

2. **Integration Tests** (`tests/integration/`): Test component interactions
   - May use real implementations where appropriate
   - Test device discovery flows
   - Test accessory lifecycle

### Example Test

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { KeyLightInstance } from '../../src/devices/KeyLightInstance.js';
import { createMockLogger } from '../mocks/homebridge.js';
import { createKeyLight, createKeyLightInfo } from '../fixtures/keylight.js';

vi.mock('axios');

describe('KeyLightInstance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Setup mocks...
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should create an instance', async () => {
    const instance = await KeyLightInstance.createInstance(
      createKeyLight(),
      createMockLogger(),
    );
    expect(instance).toBeDefined();
    instance.stopPolling();
  });
});
```

## Coverage

Coverage reports are generated in:
- `coverage/` - HTML report (open `coverage/index.html`)
- Console output shows summary

Target coverage: 80%+ for critical paths (device communication, state management).

## Best Practices

1. **Isolate tests**: Each test should be independent
2. **Clean up**: Always stop polling intervals in `afterEach`
3. **Use factories**: Use fixture factories for consistent test data
4. **Mock external deps**: Never make real network calls in tests
5. **Test edge cases**: Include error handling and boundary conditions
