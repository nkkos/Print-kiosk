# Turns a kiosk stand PC back into an ordinary PC (the reverse of the
# startup and sign-in parts of setup-stand.ps1). The Chrome and Windows
# policies stay; remove HKLM:\SOFTWARE\Policies\Google\Chrome by hand if
# that matters. Run in an elevated PowerShell.
#Requires -RunAsAdministrator
Unregister-ScheduledTask -TaskName 'PrintKioskStand' -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'PrintKioskStandNightlyReboot' -Confirm:$false -ErrorAction SilentlyContinue
$winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
Set-ItemProperty -Path $winlogon -Name 'AutoAdminLogon' -Value '0'
Remove-ItemProperty -Path $winlogon -Name 'DefaultPassword' -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*run-stand.ps1*' -or $_.CommandLine -like '*PrintKioskStand\chrome-profile*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host 'Kiosk start-up and automatic sign-in removed. The kiosk user account is kept.'
