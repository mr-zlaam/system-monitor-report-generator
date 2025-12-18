$ErrorActionPreference = "Stop"

$InstallDir = "$env:LOCALAPPDATA\denoo"
$BinaryName = "denoo.exe"
$SourceBinary = ".\dist\monitor.exe"

Write-Host "Installing denoo..."

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

Copy-Item $SourceBinary "$InstallDir\$BinaryName" -Force

$CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$CurrentPath;$InstallDir", "User")
    Write-Host "Added $InstallDir to PATH"
}

Write-Host "Installed successfully!"
Write-Host "Restart your terminal, then run 'denoo' to start using the monitor."
