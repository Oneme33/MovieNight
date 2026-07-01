module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Moet als laatste staan (Reanimated 4 gebruikt de worklets-plugin).
    plugins: ['react-native-worklets/plugin'],
  };
};
