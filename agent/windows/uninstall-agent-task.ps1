# Stops the pavilion print agent and removes its startup task
# (the reverse of install-agent-task.ps1). Run in an elevated PowerShell.
#Requires -RunAsAdministrator
$taskName = 'PrintKioskAgent'
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
# The runner's child node.exe outlives the task being stopped — end it too.
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*run-agent.ps1*' -or $_.CommandLine -like '*agent\index.ts*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host "Removed '$taskName'."
