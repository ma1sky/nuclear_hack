const { withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins');

// Ninja shipped with Android CMake 3.22 can reject object paths > 260 chars.
// Let CMake hash long object directories rather than requiring a Windows setting change.
module.exports = function withShortNativePaths(config) {
  if (process.platform !== 'win32') return config;
  config = withAppBuildGradle(config, mod => {
    const marker = '// nuclear-hack: short Windows CMake object paths';
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents += `\n${marker}\nandroid {\n    externalNativeBuild {\n        cmake {\n            buildStagingDirectory new File(rootProject.projectDir, "../../.cxx/app")\n        }\n    }\n    defaultConfig {\n        externalNativeBuild {\n            cmake {\n                arguments "-DCMAKE_OBJECT_PATH_MAX=256"\n            }\n        }\n    }\n}\n`;
    }
    return mod;
  });
  return withProjectBuildGradle(config, mod => {
    const marker = '// nuclear-hack: short paths for native UI libraries';
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents += `\n${marker}\nsubprojects { subproject ->\n    subproject.plugins.withId("com.android.library") {\n        subproject.android.defaultConfig.externalNativeBuild.cmake.arguments "-DCMAKE_OBJECT_PATH_MAX=240"\n    }\n}\n`;
    }
    return mod;
  });
};
