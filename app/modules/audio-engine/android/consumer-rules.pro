# sherpa-onnx JNI looks up these classes, methods and configuration fields by name.
-keep class com.k2fsa.sherpa.onnx.** { *; }

# llama.rn JNI classes must survive release shrinking.
-keep class com.rnllama.** { *; }

# ONNX Runtime Java API (FastSegmenter): JNI creates these classes and reads their fields by name.
-keep class ai.onnxruntime.** { *; }
