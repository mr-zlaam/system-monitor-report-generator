#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$REPO = "mr-zlaam/system-monitor-report-generator"
$BINARY_NAME = "denoo"
$INSTALL_DIR = "$env:LOCALAPPDATA\denoo"
$SERVICE_NAME = "Denoo"

function Write-Status { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "+===========================================+" -ForegroundColor Cyan
Write-Host "|     Denoo System Monitor Installer        |" -ForegroundColor Cyan
Write-Host "+===========================================+" -ForegroundColor Cyan
Write-Host ""

try {
    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases/latest"
    $LATEST_RELEASE = $releases.tag_name
} catch {
    Write-Error "Could not fetch latest release"
    exit 1
}

Write-Status "Latest version: $LATEST_RELEASE"

$DOWNLOAD_URL = "https://github.com/$REPO/releases/download/$LATEST_RELEASE/denoo-windows-x64.zip"

if (!(Test-Path $INSTALL_DIR)) {
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
}

Write-Host "Downloading $BINARY_NAME..."
$TMP_FILE = "$env:TEMP\denoo.zip"
Invoke-WebRequest -Uri $DOWNLOAD_URL -OutFile $TMP_FILE

Write-Host "Extracting..."
Expand-Archive -Path $TMP_FILE -DestinationPath $INSTALL_DIR -Force
Remove-Item $TMP_FILE -Force

Write-Status "Binary installed to $INSTALL_DIR\$BINARY_NAME.exe"

$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$INSTALL_DIR*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$INSTALL_DIR", "User")
    Write-Status "Added to PATH"
}

Write-Host ""
Write-Host "Creating scheduled task for auto-start..."

$action = New-ScheduledTaskAction -Execute "$INSTALL_DIR\$BINARY_NAME.exe" -Argument "start"
$trigger = New-ScheduledTaskTrigger -AtLogon
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

$existingTask = Get-ScheduledTask -TaskName $SERVICE_NAME -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $SERVICE_NAME -Confirm:$false
}

Register-ScheduledTask -TaskName $SERVICE_NAME -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Denoo System Monitor" | Out-Null

Write-Status "Scheduled task created"

Write-Host ""
Write-Host "+===========================================+" -ForegroundColor Cyan
Write-Host "|         Installation Complete!            |" -ForegroundColor Cyan
Write-Host "+===========================================+" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. RESTART your terminal (or run: `$env:Path = [Environment]::GetEnvironmentVariable('Path','User'))"
Write-Host ""
Write-Host "  2. Run setup wizard:"
Write-Host "     $BINARY_NAME setup" -ForegroundColor White
Write-Host ""
Write-Host "  3. After setup, start monitoring:"
Write-Host "     $BINARY_NAME start" -ForegroundColor White
Write-Host ""
Write-Host "  (Service will auto-start on login after setup)"
Write-Host ""
Write-Host "Commands:" -ForegroundColor Yellow
Write-Host "  $BINARY_NAME setup     - Configure notifications"
Write-Host "  $BINARY_NAME start     - Start monitoring"
Write-Host "  $BINARY_NAME status    - Quick system status"
Write-Host "  $BINARY_NAME report    - Generate report now"
Write-Host "  $BINARY_NAME config    - View/edit configuration"
Write-Host ""
