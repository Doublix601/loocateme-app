const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// react-native-firebase under use_frameworks! :linkage => :static (expo-build-properties
// useFrameworks: "static") needs several things to build under React Native's New
// Architecture, documented at https://rnfirebase.io under "Static Frameworks" plus
// community-verified fixes for "must be imported from module ... before it is required":
//   1. $RNFirebaseAsStaticFramework = true, or Firebase pods fail with
//      "must be imported from module ... before it is required".
//   2. use_modular_headers!, so React-Core (which defines RCT_EXPORT_METHOD via
//      RCTBridgeModule.h) is compiled as a real Clang module. Without it, RNFB's static
//      framework modules can't see RCT_EXPORT_METHOD as a macro, so it's left
//      unexpanded and gets parsed as literal (broken) C, e.g. in RNFBAnalyticsModule.m.
//   3. CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES, or any remaining
//      non-modular header includes fail the build (-Werror).
//   4. CLANG_ENABLE_EXPLICIT_MODULES = NO. Xcode's newer "Explicit Modules" build
//      system enforces stricter cross-module symbol visibility than the classic
//      implicit modules system, and fails with "declaration of X must be imported
//      from module Y before it is required" for RNFBApp/RCTBridgeModule specifically.
//      Disabling it falls back to the more lenient implicit modules resolution that
//      the rest of the React Native/CocoaPods ecosystem is built around.
module.exports = function withFirebaseModularHeadersFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      const header = ['$RNFirebaseAsStaticFramework = true', 'use_modular_headers!'];
      const missingHeaderLines = header.filter((line) => !contents.includes(line));
      if (missingHeaderLines.length > 0) {
        contents = `${missingHeaderLines.join('\n')}\n${contents}`;
      }

      const marker = 'post_install do |installer|';
      if (contents.includes(marker) && !contents.includes('CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES')) {
        contents = contents.replace(
          marker,
          `${marker}\n    installer.pods_project.targets.each do |target|\n      target.build_configurations.each do |build_config|\n        build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'\n        build_config.build_settings['CLANG_ENABLE_EXPLICIT_MODULES'] = 'NO'\n      end\n    end`
        );
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
