const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');
const { pack, sourceDirectory } = require('../scripts/model-bundle.cjs');

module.exports = function withBundledModels(config) {
  return withDangerousMod(config, ['android', async mod => {
    const root = mod.modRequest.projectRoot;
    await pack(sourceDirectory(root), path.join(root, 'modules/audio-engine/android/src/main/assets/models'));
    return mod;
  }]);
};
