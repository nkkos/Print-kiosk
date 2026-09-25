# Registers the pavilion print agent to start automatically with Windows
# (see README.md, "Print agent"). Run once, in an elevated PowerShell, on the
# pavilion mini-PC, after `npm ci` and after creating .env in the repository
# root:
#   powershell -ExecutionPolicy Bypass -File agent\windows\install-agent-task.ps1
#
# The task runs as SYSTEM at startup — no one needs to log in — and
# run-agent.ps1 restarts the agent whenever it exits. The print queues it
# uses (HL9430-Bin1..4) must be machine-wide queues on a Standard TCP/IP
# port, which is what an administrator creates by default; per-user printer
# connections are invisible to SYSTEM.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$taskName = 'PrintKioskAgent'
$runner = (Resolve-Path (Join-Path $PSScriptRoot 'run-agent.ps1')).Path

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
# Second safety net behind run-agent.ps1's own loop: if the runner itself
# dies, Task Scheduler starts it again. No time limit — it runs forever.
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Registered and started '$taskName'. Log: $(Join-Path (Resolve-Path "$PSScriptRoot\..\..") 'logs\agent.log')"
