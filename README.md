# Denoo - System Monitor

A personal system monitoring tool with WhatsApp & Email notifications.

## Quick Install

### Linux

```bash
curl -fsSL https://raw.githubusercontent.com/mr-zlaam/system-monitor-report-generator/main/install.sh | sudo bash
```

### Windows (PowerShell as Admin)

```powershell
irm https://raw.githubusercontent.com/mr-zlaam/system-monitor-report-generator/main/install.ps1 | iex
```

## Usage

### 1. Setup (Required First)

#

```bash
denoo setup
```

This will configure WhatsApp and/or Email notifications.

### 2. Start Monitoring

```bash
denoo start
```

Or enable as a system service:

```bash
# Linux
sudo systemctl enable denoo
sudo systemctl start denoo

# Windows (auto-starts on login after setup)
```

## Commands

| Command          | Description                  |
| ---------------- | ---------------------------- |
| `denoo setup`    | Interactive setup wizard     |
| `denoo start`    | Start monitoring daemon      |
| `denoo status`   | Quick system status          |
| `denoo report`   | Generate and send report now |
| `denoo config`   | View/edit configuration      |
| `denoo edit`     | Interactive settings editor  |
| `denoo test -w`  | Test WhatsApp notification   |
| `denoo test -e`  | Test email notification      |
| `denoo whatsapp` | WhatsApp authentication      |

## Features

- Real-time system monitoring (CPU, RAM, Disk)
- Login/unlock detection
- Browser history tracking
- Running programs monitoring
- Suspicious activity detection
- WhatsApp notifications
- Email notifications
- Configurable alert thresholds
- Scheduled reports

## Configuration

Config stored at: `~/.config/system-monitor/config.json`

## Development

```bash
bun install
bun run dev
bun run compile  # Build binary
```
