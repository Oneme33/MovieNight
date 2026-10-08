// Expo config plugin: keeps the release build setup in the repo instead of hand-editing the
// generated android/ folder (which `expo prebuild --clean` throws away).
// - Release builds are signed with the keystore named in ~/.gradle/gradle.properties:
//     MN_STORE_FILE=/absolute/path/to/release-key.jks
//     MN_STORE_PASSWORD=…  MN_KEY_ALIAS=…  MN_KEY_PASSWORD=…
//   (kept outside the repo; every build must use the same key or updates won't install).
// - arm64-only APK (~40 MB instead of ~100 MB).
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const SIGNING = `
        release {
            if (project.hasProperty('MN_STORE_FILE')) {
                storeFile file(MN_STORE_FILE)
                storePassword MN_STORE_PASSWORD
                keyAlias MN_KEY_ALIAS
                keyPassword MN_KEY_PASSWORD
            }
        }`;

module.exports = function withReleaseSigning(config) {
  config = withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (!g.includes('MN_STORE_FILE')) {
      g = g.replace(/signingConfigs\s*\{/, (m) => m + SIGNING);
      // The release buildType points at the debug key by default.
      g = g.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        '$1signingConfig signingConfigs.release');
    }
    cfg.modResults.contents = g;
    return cfg;
  });
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === 'reactNativeArchitectures'));
    props.push({ type: 'property', key: 'reactNativeArchitectures', value: 'arm64-v8a' });
    cfg.modResults = props;
    return cfg;
  });
};
