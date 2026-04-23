// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for resolving .ts, .tsx, and .cjs files
config.resolver.sourceExts.push('ts', 'tsx', 'cjs');

module.exports = wrapWithReanimatedMetroConfig(config);
