param([string]$StudioPath = 'D:\Programs\Android Studio', [string]$AndroidSdk = "$env:LOCALAPPDATA\Android\Sdk")
$ErrorActionPreference = 'Stop'
$app = Split-Path -Parent $PSScriptRoot
$module = Join-Path $app 'modules\audio-engine'
$out = Join-Path $module 'build\native-check'
$aar = Join-Path $app 'models\downloads\sherpa-onnx-2.0.1.aar'
if (-not (Test-Path $aar)) { throw 'Run npm run models:android first.' }
if ((Get-FileHash -LiteralPath $aar).Hash.ToLower() -ne 'a8d09d1d32f3eb8520482c6d3d43fae674681c5b050385967c70a3c2c9bf0ee7') { throw 'AAR checksum mismatch' }
New-Item -ItemType Directory -Path $out -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($aar)
try { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry('classes.jar'), (Join-Path $out 'sherpa.jar'), $true) } finally { $zip.Dispose() }
$compiler = Join-Path $StudioPath 'plugins\Kotlin\kotlinc\lib'
$sources = @(Get-ChildItem (Join-Path $module 'android\src\main\java\expo\modules\audioengine\audio\*.kt') | ForEach-Object FullName)
foreach ($name in @('GigaAmRecognizer.kt','StreamingAudioPreparer.kt','SpeakerDiarizer.kt','Recluster.kt')) { $sources += Join-Path $module "android\src\main\java\expo\modules\audioengine\$name" }
& (Join-Path $StudioPath 'jbr\bin\java.exe') -cp "$compiler\*" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -classpath "$compiler\kotlin-stdlib.jar;$out\sherpa.jar;$AndroidSdk\platforms\android-37.0\android.jar" -d $out @sources
if ($LASTEXITCODE -ne 0) { throw 'Native audio API compilation failed' }
Write-Output 'Native audio compiled against sherpa 2.0.1 and Android API 37 (not an APK/runtime test).'
