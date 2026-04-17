// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for resolving .ts and .tsx files in node_modules if needed,
// but specifically handle react-native-iap redirecting to pre-compiled lib if src fails.
config.resolver.sourceExts.push('ts', 'tsx', 'cjs');

module.exports = config;
