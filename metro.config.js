// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for resolving .ts and .tsx files in node_modules if needed,
// but specifically handle react-native-iap redirecting to pre-compiled lib if src fails.
config.resolver.sourceExts.push('ts', 'tsx', 'cjs');

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-reanimated') {
    return {
      filePath: __dirname + '/node_modules/react-native-reanimated/lib/module/index.js',
      type: 'sourceFile',
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = wrapWithReanimatedMetroConfig(config);
