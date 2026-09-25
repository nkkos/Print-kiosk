# Keeps the pavilion print agent running (see README.md, "Print agent").
# Started at boot by the scheduled task from install-agent-task.ps1; can also
# be run by hand to try it. Runs the agent from the repository root (where
# its .env lives), appends everything it prints to logs\agent.log, and
# restarts it 10 seconds after any exit — a crash, a lost network, or an
# unhandled error must never leave the pavilion without printing.
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$logDir = Join-Path $repo 'logs'
$log = Join-Path $logDir 'agent.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
$tsx = Join-Path $repo 'node_modules\tsx\dist\cli.mjs'

Set-Location $repo
while ($true) {
  # Keep one previous log around once the current one passes 10 MB.
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 10MB) {
    Move-Item -Force $log "$log.1"
  }
  Add-Content -Path $log -Value "[run-agent] $(Get-Date -Format s) starting agent"
  # Redirected through cmd.exe, not PowerShell: Windows PowerShell 5 would
  # re-encode the output as UTF-16 and wrap stderr lines in error records.
  cmd.exe /c "`"$node`" `"$tsx`" agent\index.ts >> `"$log`" 2>&1"
  Add-Content -Path $log -Value "[run-agent] $(Get-Date -Format s) agent exited with code $LASTEXITCODE, restarting in 10 s"
  Start-Sleep -Seconds 10
}
