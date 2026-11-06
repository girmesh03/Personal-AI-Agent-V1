/**
 * @module models/Audio
 * @description Compatibility bridge mapping legacy Audio model onto unified Asset model (Row 51).
 */

import { Asset } from '../modules/assets/persistence/Asset.js';

export const Audio = Asset;
export default Asset;
