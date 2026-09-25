# Sets up the pavilion printer on the mini-PC (docs/pavilion-launch-checklist.md,
# "Before opening — printer"): Brother HL-L9430CDN + MX-4000 mailbox +
# LT-330CL lower tray. Run in an elevated PowerShell. Safe to re-run — every
# step skips what already exists, so run it again after fixing whatever it
# reports.
#
#   powershell -ExecutionPolicy Bypass -File agent\windows\setup-printer.ps1 `
#     -PrinterIp 192.168.1.50 -DriverInf C:\Brother\HL-L9430CDN\gdi\BROCH19A.INF
#
# What it does:
#   1. Installs the Brother PCL driver from its INF (skipped if installed).
#      Get the driver from support.brother.com (HL-L9430CDN → Downloads →
#      "Printer Driver"); running the downloaded .exe unpacks it — point
#      -DriverInf at gdi\BROCH19A.INF inside the unpacked folder.
#   2. Creates a Standard TCP/IP port for the printer (RAW 9100, SNMP on).
#   3. Creates queues HL9430-Bin1..Bin4 (one per mailbox bin) and HL9430-Staff.
#   4. Pins each queue's Printing Defaults to its output bin: "MX bin N" for
#      BinN, the standard output tray for Staff. The mailbox bin is a Brother
#      driver setting that ordinary cmdlets can't reach, so this reads the
#      driver's PrintCapabilities and writes the matching option (MailBoxN)
#      into the queue's default PrintTicket — the mechanism found in the
#      driver (feature JobOutputBin, see the brother-driver-findings notes).
#   5. Prints the .env lines for the print agent.
#
# If step 4 finds no MailBox options, the driver doesn't know the MX-4000 is
# installed yet: open any HL9430 queue → Printer properties → Device
# Settings → tick the mailbox (MX-4000, 4 bins) and the lower tray (or press
# Auto Detect), repeat for each queue, then run this script again.
#
# -CaptureDriverOutput also prints one test page per bin into .prn files
# (a local file port, no paper) so the driver's exact PJL commands
# (@PJL SET OUTBIN=...) can be read — only needed for the fallback plan of
# sending jobs straight to port 9100.

#Requires -RunAsAdministrator
param(
  [Parameter(Mandatory = $true)] [string] $PrinterIp,
  [string] $DriverInf,
  [string] $DriverName = 'Brother HL-L9430CDN series',
  [string] $QueuePrefix = 'HL9430',
  [switch] $CaptureDriverOutput
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Printing

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "   OK   $text" -ForegroundColor Green }
function Warn($text) { Write-Host "   !!   $text" -ForegroundColor Yellow }

# --- 1. Driver -------------------------------------------------------------
Step 'Driver'
if (Get-PrinterDriver -Name $DriverName -ErrorAction SilentlyContinue) {
  Ok "'$DriverName' already installed"
} else {
  if (-not $DriverInf) { throw "Driver '$DriverName' is not installed — pass -DriverInf <path to BROCH19A.INF>" }
  pnputil.exe /add-driver $DriverInf /install | Out-Host
  Add-PrinterDriver -Name $DriverName
  Ok "installed '$DriverName'"
}

# --- 2. Port ---------------------------------------------------------------
Step 'Port'
$portName = "IP_$PrinterIp"
if (Get-PrinterPort -Name $portName -ErrorAction SilentlyContinue) {
  Ok "port $portName exists"
} else {
  Add-PrinterPort -Name $portName -PrinterHostAddress $PrinterIp -PortNumber 9100 -SNMP 1 -SNMPCommunity 'public'
  Ok "created port $portName (RAW 9100, SNMP public)"
}

# --- 3. Queues -------------------------------------------------------------
Step 'Queues'
$queues = @()
foreach ($n in 1..4) { $queues += @{ Name = "$QueuePrefix-Bin$n"; Bin = "MailBox$n"; Label = "MX bin $n" } }
$queues += @{ Name = "$QueuePrefix-Staff"; Bin = 'BuiltinBin'; Label = 'standard output tray' }
foreach ($q in $queues) {
  if (Get-Printer -Name $q.Name -ErrorAction SilentlyContinue) {
    Ok "$($q.Name) exists"
  } else {
    Add-Printer -Name $q.Name -DriverName $DriverName -PortName $portName
    Ok "created $($q.Name)"
  }
}

# --- 4. Output bin defaults ------------------------------------------------
function Read-Xml($stream) {
  $stream.Position = 0
  $reader = New-Object System.IO.StreamReader($stream)
  $xml = New-Object System.Xml.XmlDocument
  $xml.LoadXml($reader.ReadToEnd())
  return $xml
}

# The output-bin feature and the option whose local name ends with $binSuffix
# (e.g. MailBox3), with their namespace URIs — prefixes differ per driver.
function Find-BinOption($queue, $binSuffix) {
  $caps = Read-Xml $queue.GetPrintCapabilitiesAsXml()
  foreach ($feature in $caps.SelectNodes("//*[local-name()='Feature']")) {
    $featureName = $feature.GetAttribute('name')
    if ($featureName -notmatch 'OutputBin$') { continue }
    $options = @($feature.SelectNodes("*[local-name()='Option']") | ForEach-Object { $_.GetAttribute('name') })
    $match = $options | Where-Object { ($_ -split ':')[-1] -eq $binSuffix } | Select-Object -First 1
    return @{
      Feature = $featureName
      FeatureNs = $feature.GetNamespaceOfPrefix(($featureName -split ':')[0])
      Option = $match
      OptionNs = if ($match) { $feature.GetNamespaceOfPrefix(($match -split ':')[0]) } else { $null }
      AllOptions = $options
    }
  }
  return $null
}

function Get-SelectedBin($queue) {
  $ticket = Read-Xml $queue.DefaultPrintTicket.GetXmlStream()
  $feature = $ticket.SelectNodes("//*[local-name()='Feature']") |
    Where-Object { $_.GetAttribute('name') -match 'OutputBin$' } | Select-Object -First 1
  if (-not $feature) { return '(no output bin in ticket)' }
  $option = $feature.SelectSingleNode("*[local-name()='Option']")
  if ($option) { return $option.GetAttribute('name') }
  return '(none)'
}

Step 'Output bin defaults (Printing Defaults of each queue)'
$server = New-Object System.Printing.LocalPrintServer([System.Printing.PrintSystemDesiredAccess]::AdministrateServer)
$missingOptions = $false
foreach ($q in $queues) {
  $queue = New-Object System.Printing.PrintQueue($server, $q.Name, [System.Printing.PrintSystemDesiredAccess]::AdministratePrinter)
  $bin = Find-BinOption $queue $q.Bin
  if (-not $bin) { Warn "$($q.Name): driver reports no output-bin feature at all"; $missingOptions = $true; continue }
  if (-not $bin.Option) {
    Warn "$($q.Name): no '$($q.Bin)' option (driver offers: $($bin.AllOptions -join ', '))"
    $missingOptions = $true
    continue
  }
  $featurePrefix = ($bin.Feature -split ':')[0]
  $optionPrefix = ($bin.Option -split ':')[0]
  $namespaces = "xmlns:$featurePrefix=`"$($bin.FeatureNs)`""
  if ($optionPrefix -ne $featurePrefix) { $namespaces += " xmlns:$optionPrefix=`"$($bin.OptionNs)`"" }
  $delta = "<?xml version=`"1.0`" encoding=`"UTF-8`"?>" +
    "<psf:PrintTicket xmlns:psf=`"http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework`" $namespaces version=`"1`">" +
    "<psf:Feature name=`"$($bin.Feature)`"><psf:Option name=`"$($bin.Option)`"/></psf:Feature></psf:PrintTicket>"
  $deltaStream = New-Object System.IO.MemoryStream(,[System.Text.Encoding]::UTF8.GetBytes($delta))
  $deltaTicket = New-Object System.Printing.PrintTicket($deltaStream)
  $merged = $queue.MergeAndValidatePrintTicket($queue.DefaultPrintTicket, $deltaTicket)
  $queue.DefaultPrintTicket = $merged.ValidatedPrintTicket
  $queue.Commit()
  $queue.Refresh()
  $selected = Get-SelectedBin $queue
  if (($selected -split ':')[-1] -eq $q.Bin) { Ok "$($q.Name) → $($q.Label) ($selected)" }
  else { Warn "$($q.Name): asked for $($q.Bin), driver kept $selected" ; $missingOptions = $true }
}
if ($missingOptions) {
  Warn 'Some bins are not set. Tick the MX-4000 mailbox and the lower tray under Printer properties → Device Settings (or Auto Detect) for each HL9430 queue, then run this script again.'
}

# --- Optional: capture the driver's output for PJL inspection --------------
if ($CaptureDriverOutput) {
  Step 'Driver output capture (no paper)'
  $captureDir = Join-Path $PSScriptRoot '..\..\logs\driver-capture'
  New-Item -ItemType Directory -Force -Path $captureDir | Out-Null
  $sumatra = Get-ChildItem (Join-Path $PSScriptRoot '..\..\node_modules\pdf-to-printer\dist') -Filter 'SumatraPDF*.exe' | Select-Object -First 1
  $testPdf = Join-Path $PSScriptRoot '..\..\server\assets\print-test-page.pdf'
  foreach ($n in 1..4) {
    $file = (Join-Path (Resolve-Path $captureDir) "bin$n.prn")
    $captureQueue = "$QueuePrefix-Capture$n"
    if (-not (Get-PrinterPort -Name $file -ErrorAction SilentlyContinue)) { Add-PrinterPort -Name $file }
    if (-not (Get-Printer -Name $captureQueue -ErrorAction SilentlyContinue)) {
      Add-Printer -Name $captureQueue -DriverName $DriverName -PortName $file
    }
    $queue = New-Object System.Printing.PrintQueue($server, $captureQueue, [System.Printing.PrintSystemDesiredAccess]::AdministratePrinter)
    $source = New-Object System.Printing.PrintQueue($server, "$QueuePrefix-Bin$n", [System.Printing.PrintSystemDesiredAccess]::AdministratePrinter)
    $queue.DefaultPrintTicket = $source.DefaultPrintTicket
    $queue.Commit()
    & $sumatra.FullName -print-to $captureQueue -silent $testPdf
    Start-Sleep -Seconds 5
    Remove-Printer -Name $captureQueue
    $pjl = Select-String -Path $file -Pattern '@PJL SET (OUTBIN|MEDIASOURCE|AVOIDMAILBOXFULL)[^\r\n]*' -AllMatches -ErrorAction SilentlyContinue |
      ForEach-Object { $_.Matches.Value } | Select-Object -Unique
    Ok "bin$n.prn: $($pjl -join ' | ')"
  }
}

# --- 5. Agent settings -----------------------------------------------------
Step 'Put these lines in the print agent''s .env (repository root)'
foreach ($n in 1..4) { Write-Host "PRINTER_QUEUE_BIN_$n=$QueuePrefix-Bin$n" }
Write-Host "PRINTER_SNMP_HOST=$PrinterIp"
Write-Host ''
Write-Host 'Then check P5 in the acceptance checklist: open each queue → Advanced → Printing Defaults and confirm the Output Tray shown there.'
