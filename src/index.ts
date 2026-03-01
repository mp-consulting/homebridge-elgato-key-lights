import type { API } from 'homebridge';

import { PLATFORM_NAME } from './config/settings.js';
import { KeyLightsPlatform } from './platform/KeyLightsPlatform.js';

/**
 * This method registers the platform with Homebridge
 */
export default (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, KeyLightsPlatform);
};
