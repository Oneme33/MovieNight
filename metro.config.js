// Metro config: Expo's defaults plus Sentry's Debug IDs, so crash reports from the Hermes
// bundle can be matched to their source maps (uploaded by the build when a token is set).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
