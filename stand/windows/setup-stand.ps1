# One-time setup of a kiosk stand PC (see README.md, "Kiosk stand PC").
# A stand runs none of our code: it is a Windows PC that signs in by itself
# and shows the kiosk site full screen in Chrome. Copy this folder to the
# stand (a USB stick is enough) and run, in an elevated PowerShell:
#   powershell -ExecutionPolicy Bypass -File setup-stand.ps1 -StandId A -StandKey <key>
# The stand key is in .env.security (STAND_API_KEYS); leave it out only while
# the backend has no keys configured. Safe to re-run, e.g. to change the URL
# or the key.
#
# What it does:
#   - creates a standard (non-admin) local user "kiosk" and signs it in
#     automatically at boot;
#   - at that sign-in, run-stand.ps1 opens Chrome in kiosk mode on the stand's
#     URL and reopens it within seconds whenever it closes or crashes;
#   - locks Chrome down for a public screen (no saved passwords or autofill,
#     no translate bar, no sign-in, no printing, no dev tools);
#   - turns off Windows edge swipes (the way out of a full-screen app on a
#     touch screen), sleep, the screen turning off, and restarts for updates
#     while someone is signed in;
#   - reboots the PC every night (-NightlyRebootAt, default 04:30), which also
#     lets Windows and Chrome updates finish.
# Staff get out of kiosk mode with a keyboard: Ctrl+Alt+Del -> Switch user,
# then sign in with an administrator account. uninstall-stand.ps1 undoes the
# startup and sign-in parts.
#Requires -RunAsAdministrator
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9-]{1,16}$')][string]$StandId,
  [string]$StandKey = '',
  [string]$KioskUrl = 'https://print-kiosk-4o9.pages.dev/',
  [string]$KioskUser = 'kiosk',
  [string]$KioskPassword = '',
  [string]$NightlyRebootAt = '04:30'
)
$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:ProgramData 'PrintKioskStand'

function Set-RegistryValue([string]$Path, [string]$Name, $Value, [string]$Type = 'DWord') {
  if (-not (Test-Path $Path)) { New-Item -Path $Path -Force | Out-Null }
  New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Type -Force | Out-Null
}

# --- The kiosk user and automatic sign-in -----------------------------------
if (-not $KioskPassword) {
  $secure = Read-Host -AsSecureString "Password for the local '$KioskUser' account (new or existing)"
  $KioskPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
$securePassword = ConvertTo-SecureString $KioskPassword -AsPlainText -Force
$existing = Get-LocalUser -Name $KioskUser -ErrorAction SilentlyContinue
if ($existing) {
  Set-LocalUser -Name $KioskUser -Password $securePassword -PasswordNeverExpires $true
} else {
  New-LocalUser -Name $KioskUser -Password $securePassword -PasswordNeverExpires `
    -UserMayNotChangePassword -FullName 'Kiosk stand' -Description 'Print kiosk stand screen' | Out-Null
  Add-LocalGroupMember -Group (Get-LocalGroup -SID 'S-1-5-32-545').Name -Member $KioskUser
}

# Windows' own automatic sign-in. The password sits in the registry, readable
# only on this PC; Sysinternals Autologon can store it encrypted instead.
$winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
Set-RegistryValue $winlogon 'AutoAdminLogon' '1' 'String'
Set-RegistryValue $winlogon 'DefaultUserName' $KioskUser 'String'
Set-RegistryValue $winlogon 'DefaultDomainName' $env:COMPUTERNAME 'String'
Set-RegistryValue $winlogon 'DefaultPassword' $KioskPassword 'String'
Remove-ItemProperty -Path $winlogon -Name 'AutoLogonCount' -ErrorAction SilentlyContinue
# Windows 11's "passwordless sign-in" setting hides automatic sign-in.
Set-RegistryValue 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device' 'DevicePasswordLessBuildVersion' 0

# --- What the stand opens -----------------------------------------------------
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$query = "stand=$([uri]::EscapeDataString($StandId))"
if ($StandKey) { $query += "&key=$([uri]::EscapeDataString($StandKey))" }
$separator = if ($KioskUrl.Contains('?')) { '&' } else { '?' }
@{ url = "$KioskUrl$separator$query"; standId = $StandId } |
  ConvertTo-Json | Set-Content -Path (Join-Path $installDir 'stand.json') -Encoding UTF8
Copy-Item -Force (Join-Path $PSScriptRoot 'run-stand.ps1') (Join-Path $installDir 'run-stand.ps1')

# Started at the kiosk user's sign-in, in that user's session (Chrome needs a
# desktop). Task Scheduler restarts the runner itself if it ever dies.
$runner = Join-Path $installDir 'run-stand.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:COMPUTERNAME\$KioskUser"
$principal = New-ScheduledTaskPrincipal -UserId "$env:COMPUTERNAME\$KioskUser" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'PrintKioskStand' -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null

# --- Chrome for a public screen ----------------------------------------------
# Machine-wide policies (they apply to every account on this PC, which is
# meant to be a stand and nothing else). chrome://policy shows them.
$chrome = 'HKLM:\SOFTWARE\Policies\Google\Chrome'
$chromePolicies = [ordered]@{
  PasswordManagerEnabled       = 0  # never offer to save a customer's portal password
  PasswordLeakDetectionEnabled = 0
  AutofillAddressEnabled       = 0  # no one else's e-mail address suggested in a field
  AutofillCreditCardEnabled    = 0
  TranslateEnabled             = 0
  SpellcheckEnabled            = 0
  SearchSuggestEnabled         = 0
  BrowserSignin                = 0
  SyncDisabled                 = 1
  BrowserGuestModeEnabled      = 0
  BrowserAddPersonEnabled      = 0
  IncognitoModeAvailability    = 1
  DeveloperToolsAvailability   = 2
  PrintingEnabled              = 0  # printing goes through the print agent, never the stand
  DefaultNotificationsSetting  = 2
  DefaultGeolocationSetting    = 2
  SavingBrowserHistoryDisabled = 1
  HideFirstRunExperience       = 1
  PromotionalTabsEnabled       = 0
  DefaultBrowserSettingEnabled = 0
  MetricsReportingEnabled      = 0
  BackgroundModeEnabled        = 0
}
foreach ($name in $chromePolicies.Keys) { Set-RegistryValue $chrome $name $chromePolicies[$name] }

# --- Windows for a public touch screen ---------------------------------------
# No swipe in from the screen edges (Start, widgets, task view).
Set-RegistryValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\EdgeUI' 'AllowEdgeSwipe' 0
# Never sleep, never turn the screen off, no hibernation (no fast startup
# either, so a reboot is a real one).
powercfg /change monitor-timeout-ac 0 | Out-Null
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change disk-timeout-ac 0 | Out-Null
powercfg /hibernate off | Out-Null
# No restart for updates while the kiosk user is signed in (i.e. never by
# itself) - the nightly reboot below is when updates finish.
$au = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
Set-RegistryValue $au 'NoAutoRebootWithLoggedOnUsers' 1
Set-RegistryValue 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings' 'ActiveHoursStart' 6
Set-RegistryValue 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings' 'ActiveHoursEnd' 23

# --- Nightly reboot -------------------------------------------------------------
if ($NightlyRebootAt) {
  $rebootAction = New-ScheduledTaskAction -Execute 'shutdown.exe' -Argument '/r /f /t 60 /c "Nightly kiosk restart"'
  $rebootTrigger = New-ScheduledTaskTrigger -Daily -At $NightlyRebootAt
  $rebootPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName 'PrintKioskStandNightlyReboot' -Action $rebootAction `
    -Trigger $rebootTrigger -Principal $rebootPrincipal -Force | Out-Null
} else {
  Unregister-ScheduledTask -TaskName 'PrintKioskStandNightlyReboot' -Confirm:$false -ErrorAction SilentlyContinue
}

Write-Host "Stand $StandId is set up. Restart the PC: it signs in as '$KioskUser' and opens the kiosk."
Write-Host "Opens: $KioskUrl$separator$(if ($StandKey) { "stand=$StandId&key=..." } else { "stand=$StandId" })"
if (-not $StandKey) { Write-Host 'No stand key given - only right while the backend has STAND_API_KEYS unset.' }
