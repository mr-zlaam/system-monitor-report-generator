$ErrorActionPreference = "Stop"

$InstallDir = "$env:LOCALAPPDATA\denoo"
$BinaryName = "denoo.exe"
$SourceBinary = ".\dist\monitor.exe"
$TaskName = "DenooMonitor"

Write-Host "Denoo System Monitor Installer"
Write-Host "=============================="

if (-not (Test-Path $SourceBinary)) {
    Write-Host "Binary not found. Building..."
    bun run compile
}

if (-not (Test-Path $SourceBinary)) {
    Write-Host "Error: Failed to build binary"
    exit 1
}

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

Write-Host "Installing binary to $InstallDir..."
Copy-Item $SourceBinary "$InstallDir\$BinaryName" -Force

$CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$CurrentPath;$InstallDir", "User")
    Write-Host "Added $InstallDir to PATH"
}

Write-Host "Creating scheduled task for background service..."

$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($ExistingTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action = New-ScheduledTaskAction -Execute "$InstallDir\$BinaryName" -Argument "start"
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "Denoo System Monitor" | Out-Null

Write-Host "Starting service..."
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "Installation complete!"
Write-Host ""
Write-Host "Commands:"
Write-Host "  denoo              - Run manually"
Write-Host "  denoo status       - Check status"
Write-Host "  denoo stop         - Stop monitoring"
Write-Host "  denoo start        - Start monitoring"
Write-Host ""
Write-Host "Service commands (PowerShell Admin):"
Write-Host "  Get-ScheduledTask -TaskName DenooMonitor"
Write-Host "  Start-ScheduledTask -TaskName DenooMonitor"
Write-Host "  Stop-ScheduledTask -TaskName DenooMonitor"
Write-Host ""
Write-Host "Restart your terminal to use 'denoo' command."
