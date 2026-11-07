$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$launcher = Join-Path $PSScriptRoot 'Start-Stenographer.ps1'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$shell = New-Object -ComObject WScript.Shell
$path = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Нейро-стенографист — эмулятор.lnk'
$link = $shell.CreateShortcut($path)
$link.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$link.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"'
$link.WorkingDirectory = $repo
$link.IconLocation = (Join-Path $sdk 'emulator\emulator.exe') + ',0'
$link.Description = 'Запустить Android-эмулятор и Нейро-стенографист'
$link.Save()
Write-Output $path
