param([string]$AvdName = 'Release12')
$ErrorActionPreference = 'Continue'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$log = Join-Path $repo 'recordings\emulator-launcher.log'
$mutex = New-Object Threading.Mutex($false, 'Local\NuclearStenographerLauncher')
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
    $sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    $adb = Join-Path $sdk 'platform-tools\adb.exe'
    $emulator = Join-Path $sdk 'emulator\emulator.exe'
    if (!(Test-Path -LiteralPath $adb) -or !(Test-Path -LiteralPath $emulator)) { throw 'Не найден Android SDK. Установите Android Emulator и Platform Tools через Android Studio.' }
    & $adb start-server 2>&1 | Out-File $log -Encoding utf8
    $serial = $null
    $devices = @(& $adb devices) | Where-Object { $_ -match '^emulator-\d+\s+device$' }
    foreach ($device in $devices) {
        $candidate = ($device -split '\s+')[0]
        $name = @(& $adb -s $candidate emu avd name 2>$null)
        if ($name -contains $AvdName) { $serial = $candidate; break }
    }
    if (!$serial) {
        $avdHome = Join-Path $repo 'recordings\v12-qa\avds'
        if (!(Test-Path -LiteralPath (Join-Path $avdHome "$AvdName.ini"))) { throw "Не найден AVD $AvdName в $avdHome." }
        $env:ANDROID_AVD_HOME = $avdHome
        $port = 5556
        $used = @(& $adb devices) -join ' '
        while ($used -match "emulator-$port\b") { $port += 2 }
        $serial = "emulator-$port"
        Start-Process -FilePath $emulator -ArgumentList @('-avd', $AvdName, '-port', $port, '-memory', '4096', '-no-boot-anim') -WindowStyle Normal
    }
    $deadline = (Get-Date).AddMinutes(4)
    do {
        $ready = & $adb -s $serial shell getprop sys.boot_completed 2>$null
        if ("$ready".Trim() -eq '1') { break }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    if ("$ready".Trim() -ne '1') { throw 'Эмулятор не успел загрузиться за четыре минуты. Повторите запуск ярлыка.' }
    $package = 'team.hex.nuclearstenographer'
    $installed = & $adb -s $serial shell pm path $package
    if (!("$installed" -match 'package:')) {
        $metadata = Join-Path $repo 'artifacts\emulator\launcher.json'
        $apk = Join-Path $repo 'artifacts\candidates\v1.2\nuclear-stenographer-v1.2.apk'
        if (Test-Path -LiteralPath $metadata) {
            $config = Get-Content -LiteralPath $metadata -Raw | ConvertFrom-Json
            $apk = Join-Path $repo $config.apk
        }
        if (!(Test-Path -LiteralPath $apk)) { throw "APK не найден: $apk" }
        & $adb -s $serial install -r $apk 2>&1 | Out-File $log -Append -Encoding utf8
        if ($LASTEXITCODE -ne 0) { throw "Не удалось установить APK. Подробности: $log" }
    }
    & $adb -s $serial shell input keyevent KEYCODE_WAKEUP | Out-Null
    & $adb -s $serial shell am start -n "$package/.MainActivity" 2>&1 | Out-File $log -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "Не удалось открыть приложение. Подробности: $log" }
    $shell = New-Object -ComObject WScript.Shell
    [void]$shell.AppActivate(('Android Emulator - {0}:{1}' -f $AvdName, ($serial -replace 'emulator-','')))
} catch {
    $_ | Out-File $log -Append -Encoding utf8
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Нейро-стенографист')
    exit 1
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
