param(
  [string]$StudioPath = 'D:\Programs\Android Studio'
)
$ErrorActionPreference = 'Stop'
$moduleRoot = Split-Path -Parent $PSScriptRoot
$compilerLib = Join-Path $StudioPath 'plugins\Kotlin\kotlinc\lib'
$java = Join-Path $StudioPath 'jbr\bin\java.exe'
$outPath = Join-Path $moduleRoot 'build\audio-tests'
New-Item -ItemType Directory -Path $outPath -Force | Out-Null
$sources = @(Get-ChildItem (Join-Path $moduleRoot 'android\src\main\java\expo\modules\audioengine\audio\*.kt') | ForEach-Object FullName)
$sources += @(Get-ChildItem (Join-Path $moduleRoot 'android\src\main\java\expo\modules\audioengine\models\*.kt') | ForEach-Object FullName)
$sources += @(Get-ChildItem (Join-Path $PSScriptRoot '*.kt') | ForEach-Object FullName)
& $java -cp "$compilerLib\*" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -classpath "$compilerLib\kotlin-stdlib.jar" -d $outPath @sources
if ($LASTEXITCODE -ne 0) { throw 'Kotlin compilation failed' }
& $java -cp "$outPath;$compilerLib\kotlin-stdlib.jar" expo.modules.audioengine.audio.AudioPipelineTestKt
if ($LASTEXITCODE -ne 0) { throw 'Audio tests failed' }
