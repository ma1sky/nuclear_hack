param([string]$Voice='Microsoft Irina Desktop')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$project=Split-Path -Parent $PSCommandPath
$data=Get-Content -LiteralPath (Join-Path $project 'public/real/timeline-draft.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
 $speaker.SelectVoice($Voice);$speaker.Rate=1;$speaker.Volume=100
 foreach($segment in $data.segments) {
  $file=Join-Path (Join-Path $project 'public') $segment.voice
  $speaker.SetOutputToWaveFile($file);$speaker.Speak($segment.speech);$speaker.SetOutputToNull()
 }
} finally { $speaker.Dispose() }
Write-Output 'Russian action commentary generated'
