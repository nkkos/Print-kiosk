# Keeps the kiosk on screen (see README.md, "Kiosk stand PC"). Started at
# the kiosk user's sign-in by the PrintKioskStand task that setup-stand.ps1
# registers, from its copy in C:\ProgramData\PrintKioskStand. Opens Chrome in
# kiosk mode on the stand's URL and opens it again a few seconds after it
# closes or crashes. A page that is open but stuck is the backend's to notice
# (the stand stops reporting in -> pc.dead) and staff's to fix (reload from
# the admin panel, or the nightly reboot).
$ErrorActionPreference = 'Continue'
$config = Get-Content -Raw (Join-Path $PSScriptRoot 'stand.json') | ConvertFrom-Json
$dataDir = Join-Path $env:LOCALAPPDATA 'PrintKioskStand'
$profileDir = Join-Path $dataDir 'chrome-profile'
$log = Join-Path $dataDir 'stand.log'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

function Write-Log([string]$message) {
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 5MB) { Move-Item -Force $log "$log.1" }
  Add-Content -Path $log -Value "$(Get-Date -Format s) $message"
}

function Set-UserValue([string]$Path, [string]$Name, $Value, [string]$Type = 'DWord') {
  if (-not (Test-Path $Path)) { New-Item -Path $Path -Force | Out-Null }
  New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Type -Force | Out-Null
}

# Per-user settings, applied here because the kiosk user's profile only
# exists once it has signed in. The touch keyboard opens by itself when a
# text field is tapped (e-mail address, portal login) even though the PC is
# in desktop mode; no notification pop-ups over the kiosk; no screen saver.
Set-UserValue 'HKCU:\Software\Microsoft\TabletTip\1.7' 'EnableDesktopModeAutoInvoke' 1
Set-UserValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\PushNotifications' 'ToastEnabled' 0
Set-UserValue 'HKCU:\Control Panel\Desktop' 'ScreenSaveActive' '0' 'String'

$chromeExe = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $chromeExe) {
  Write-Log 'Chrome is not installed - install Google Chrome and sign in again.'
  exit 1
}

$chromeArgs = @(
  '--kiosk',
  "--user-data-dir=`"$profileDir`"",
  '--no-first-run',
  '--no-default-browser-check',
  '--noerrdialogs',
  '--disable-session-crashed-bubble',
  '--disable-pinch',                       # no pinch zoom on the touch screen
  '--overscroll-history-navigation=0',     # no swipe-back to an earlier page
  '--disable-features=Translate,TouchpadOverscrollHistoryNavigation',
  "`"$($config.url)`""
)

function Test-KioskChrome {
  $processes = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue
  return [bool]($processes | Where-Object { $_.CommandLine -like "*$profileDir*" })
}

# After a crash or a power cut Chrome offers to "restore pages" - mark the
# last exit as clean so the kiosk always opens straight on its own URL.
function Clear-CrashState {
  $prefs = Join-Path $profileDir 'Default\Preferences'
  if (-not (Test-Path $prefs)) { return }
  # .NET file calls, not Get/Set-Content: Preferences is UTF-8 without a
  # BOM, which Windows PowerShell 5 would misread and then write with one.
  $text = [IO.File]::ReadAllText($prefs)
  $fixed = $text -replace '"exit_type":"[A-Za-z]+"', '"exit_type":"Normal"' -replace '"exited_cleanly":false', '"exited_cleanly":true'
  if ($fixed -ne $text) { [IO.File]::WriteAllText($prefs, $fixed) }
}

Write-Log "stand $($config.standId) runner started"
while ($true) {
  if (-not (Test-KioskChrome)) {
    Clear-CrashState
    Write-Log 'opening the kiosk in Chrome'
    Start-Process -FilePath $chromeExe -ArgumentList $chromeArgs
    Start-Sleep -Seconds 15  # give Chrome time to start before checking again
  }
  Start-Sleep -Seconds 5
}
