param([string]$Serial = 'emulator-5556', [ValidateSet('x86_64', 'arm64-v8a')][string]$Abi = 'x86_64', [string]$ReferenceApk = 'artifacts/emulator/nuclear-stenographer-runtime-optimized.apk')
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $repo
$studio = 'D:\Programs\Android Studio'
$sdk = 'C:\Users\gutsa\AppData\Local\Android\Sdk'
$java = Join-Path $studio 'jbr/bin/java.exe'
$compiler = Join-Path $studio 'plugins/Kotlin/kotlinc/lib'
$androidJar = Join-Path $sdk 'platforms/android-37.0/android.jar'
$out = Join-Path $repo 'recordings/runtime-options/native'
New-Item -ItemType Directory -Path "$out/lib" -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$aar = [IO.Compression.ZipFile]::OpenRead((Join-Path $repo 'app/models/downloads/sherpa-onnx-2.0.1.aar'))
try { [IO.Compression.ZipFileExtensions]::ExtractToFile($aar.GetEntry('classes.jar'), "$out/sherpa-classes.jar", $true) } finally { $aar.Dispose() }
$apk = [IO.Compression.ZipFile]::OpenRead((Join-Path $repo $ReferenceApk))
try {
  foreach ($name in @('libc++_shared.so','libonnxruntime.so','libsherpa-onnx-jni.so','libsherpa-onnx-c-api.so','libsherpa-onnx-cxx-api.so')) {
    [IO.Compression.ZipFileExtensions]::ExtractToFile($apk.GetEntry("lib/$Abi/$name"), "$out/lib/$name", $true)
  }
} finally { $apk.Dispose() }
$engine = Join-Path $repo 'app/modules/audio-engine/android/src/main/java/expo/modules/audioengine'
$sources = @(Get-ChildItem (Join-Path $engine 'audio/*.kt') | ForEach-Object FullName)
$sources += @((Join-Path $engine 'SpeakerDiarizer.kt'), (Join-Path $engine 'GigaAmRecognizer.kt'), (Join-Path $PSScriptRoot 'NativeRuntimeBench.kt'))
& $java -cp "$compiler\*" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 17 -classpath "$out/sherpa-classes.jar;$androidJar;$compiler/kotlin-stdlib.jar" -d "$out/bench.jvm.jar" @sources
if ($LASTEXITCODE -ne 0) { throw 'Native benchmark compilation failed' }
& $java -cp "$sdk/build-tools/37.0.0/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 26 --lib $androidJar --output "$out/bench.dex.jar" "$out/bench.jvm.jar" "$out/sherpa-classes.jar" "$compiler/kotlin-stdlib.jar"
if ($LASTEXITCODE -ne 0) { throw 'DEX compilation failed' }
$adb = Join-Path $sdk 'platform-tools/adb.exe'
& $adb -s $Serial shell mkdir -p /data/local/tmp/nuclear-runtime/models /data/local/tmp/nuclear-runtime/cache
& $adb -s $Serial push "$out/bench.dex.jar" /data/local/tmp/nuclear-runtime/bench.dex.jar
& $adb -s $Serial push "$out/lib" /data/local/tmp/nuclear-runtime/
foreach ($file in @('pyannote-segmentation.int8.onnx','3dspeaker.onnx','gigaam-v2.int8.onnx','gigaam-tokens.txt')) {
  & $adb -s $Serial push "app/models/bundles/full/models/$file" "/data/local/tmp/nuclear-runtime/models/$file"
  if ($LASTEXITCODE -ne 0) { throw "Failed pushing $file" }
}
& $adb -s $Serial push recordings/runtime-options/models/nemo_en_titanet_small.onnx /data/local/tmp/nuclear-runtime/models/nemo_en_titanet_small.onnx
if ($LASTEXITCODE -ne 0) { throw 'Failed pushing TitaNet' }
