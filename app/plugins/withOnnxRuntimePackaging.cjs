const { withAppBuildGradle } = require('expo/config-plugins');

// sherpa-onnx (AAR) and onnxruntime-android (Java API used by FastSegmenter) both ship
// lib/<abi>/libonnxruntime.so of the same 1.28 line. Package one copy; both use only the
// versioned ORT C API, so either file serves both.
module.exports = function withOnnxRuntimePackaging(config) {
  return withAppBuildGradle(config, mod => {
    const marker = '// nuclear-hack: single libonnxruntime.so for sherpa-onnx + onnxruntime-android';
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents += `\n${marker}\nandroid {\n    packagingOptions {\n        jniLibs {\n            pickFirsts += ['**/libonnxruntime.so']\n        }\n    }\n}\n`;
    }
    return mod;
  });
};
