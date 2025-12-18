import { exec } from "child_process";
import { promisify } from "util";
import { platform } from "os";

const execAsync = promisify(exec);
const isWindows = platform() === "win32";

export interface LoginEvent {
  user: string;
  terminal: string;
  host: string;
  loginTime: Date;
  logoutTime?: Date;
  duration?: string;
  type: "login" | "logout" | "failed" | "reboot";
}

export interface CurrentSession {
  user: string;
  terminal: string;
  loginTime: Date;
  host: string;
  idle: string;
}

export async function getCurrentSessions(): Promise<CurrentSession[]> {
  try {
    if (isWindows) {
      const { stdout } = await execAsync(
        `powershell -Command "Get-CimInstance -ClassName Win32_LogonSession | Where-Object { $_.LogonType -eq 2 -or $_.LogonType -eq 10 } | ForEach-Object { $session = $_; Get-CimInstance -ClassName Win32_LoggedOnUser | Where-Object { $_.Dependent.LogonId -eq $session.LogonId } | ForEach-Object { $user = $_.Antecedent; [PSCustomObject]@{ User = $user.Name; LogonType = $session.LogonType; StartTime = $session.StartTime } } } | ConvertTo-Json"`
      );
      
      if (!stdout.trim()) return [];
      
      const sessions = JSON.parse(stdout);
      const sessionArray = Array.isArray(sessions) ? sessions : [sessions];
      
      return sessionArray.map((s: any) => ({
        user: s.User || "unknown",
        terminal: s.LogonType === 10 ? "RDP" : "Console",
        loginTime: s.StartTime ? new Date(s.StartTime) : new Date(),
        host: "local",
        idle: "active",
      }));
    } else {
      const { stdout } = await execAsync("who -u 2>/dev/null || who");
      const lines = stdout.trim().split("\n").filter(Boolean);

      return lines.map((line) => {
        const parts = line.split(/\s+/);
        return {
          user: parts[0] || "unknown",
          terminal: parts[1] || "unknown",
          loginTime: new Date(parts.slice(2, 4).join(" ")),
          host: parts[4]?.replace(/[()]/g, "") || "local",
          idle: parts[5] || "active",
        };
      });
    }
  } catch {
    return [];
  }
}

export async function getRecentLogins(count: number = 10): Promise<LoginEvent[]> {
  try {
    if (isWindows) {
      const { stdout } = await execAsync(
        `powershell -Command "Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} -MaxEvents ${count} 2>$null | ForEach-Object { [PSCustomObject]@{ Time = $_.TimeCreated; User = $_.Properties[5].Value; LogonType = $_.Properties[8].Value; Host = $_.Properties[18].Value } } | ConvertTo-Json"`
      );
      
      if (!stdout.trim()) return [];
      
      const events = JSON.parse(stdout);
      const eventArray = Array.isArray(events) ? events : [events];
      
      return eventArray
        .filter((e: any) => e.LogonType === 2 || e.LogonType === 10)
        .map((e: any) => ({
          user: e.User || "unknown",
          terminal: e.LogonType === 10 ? "RDP" : "Console",
          host: e.Host || "local",
          loginTime: new Date(e.Time),
          type: "login" as const,
        }));
    } else {
      const { stdout } = await execAsync(`last -n ${count} -F 2>/dev/null || last -n ${count}`);
      const lines = stdout.trim().split("\n").filter(Boolean);
      const events: LoginEvent[] = [];

      for (const line of lines) {
        if (line.startsWith("wtmp") || line.startsWith("reboot")) continue;
        if (line.includes("still logged in")) {
          const parts = line.split(/\s+/);
          events.push({
            user: parts[0] || "unknown",
            terminal: parts[1] || "unknown",
            host: parts[2]?.includes(":") ? parts[2] : "local",
            loginTime: new Date(),
            type: "login",
          });
        }
      }

      return events;
    }
  } catch {
    return [];
  }
}

export async function getFailedLogins(hours: number = 24): Promise<LoginEvent[]> {
  try {
    if (isWindows) {
      const { stdout } = await execAsync(
        `powershell -Command "$start = (Get-Date).AddHours(-${hours}); Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; StartTime=$start} 2>$null | ForEach-Object { [PSCustomObject]@{ Time = $_.TimeCreated; User = $_.Properties[5].Value; Host = $_.Properties[19].Value } } | ConvertTo-Json"`
      );
      
      if (!stdout.trim()) return [];
      
      const events = JSON.parse(stdout);
      const eventArray = Array.isArray(events) ? events : [events];
      
      return eventArray.map((e: any) => ({
        user: e.User || "unknown",
        terminal: "login",
        host: e.Host || "unknown",
        loginTime: new Date(e.Time),
        type: "failed" as const,
      }));
    } else {
      const { existsSync, readFileSync } = require("fs");
      const authLogPaths = [
        "/var/log/auth.log",
        "/var/log/secure",
        "/var/log/messages",
      ];

      let authLog = "";
      for (const path of authLogPaths) {
        if (existsSync(path)) {
          try {
            authLog = readFileSync(path, "utf-8");
            break;
          } catch {
            continue;
          }
        }
      }

      if (!authLog) {
        try {
          const { stdout } = await execAsync(
            `journalctl -u sshd --since "${hours} hours ago" 2>/dev/null | grep -i "failed\\|invalid" || true`
          );
          authLog = stdout;
        } catch {
          return [];
        }
      }

      const failedEvents: LoginEvent[] = [];
      const lines = authLog.split("\n");
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

      for (const line of lines) {
        if (
          line.toLowerCase().includes("failed password") ||
          line.toLowerCase().includes("authentication failure") ||
          line.toLowerCase().includes("invalid user")
        ) {
          const dateMatch = line.match(
            /^(\w+\s+\d+\s+\d+:\d+:\d+)|(\d{4}-\d{2}-\d{2}T\d+:\d+:\d+)/
          );
          const userMatch = line.match(/user[=:\s]+(\w+)/i) || line.match(/for\s+(\w+)/i);
          const hostMatch = line.match(/from\s+([\d.]+|[\w.-]+)/i);

          if (dateMatch) {
            const eventTime = new Date(dateMatch[0]);
            if (eventTime > cutoffTime) {
              failedEvents.push({
                user: userMatch?.[1] || "unknown",
                terminal: "ssh",
                host: hostMatch?.[1] || "unknown",
                loginTime: eventTime,
                type: "failed",
              });
            }
          }
        }
      }

      return failedEvents;
    }
  } catch {
    return [];
  }
}

export async function getLastReboot(): Promise<Date | null> {
  try {
    if (isWindows) {
      const { stdout } = await execAsync(
        `powershell -Command "(Get-CimInstance -ClassName Win32_OperatingSystem).LastBootUpTime | Get-Date -Format o"`
      );
      return new Date(stdout.trim());
    } else {
      const { stdout } = await execAsync("who -b");
      const match = stdout.match(/system boot\s+(.+)/);
      if (match && match[1]) {
        return new Date(match[1].trim());
      }
    }
  } catch {
  }
  return null;
}

type LoginCallback = (event: LoginEvent) => void;

let loginWatcher: ReturnType<typeof setInterval> | null = null;
let lastSessionCount = 0;

export function watchLogins(callback: LoginCallback): void {
  getCurrentSessions().then((sessions) => {
    lastSessionCount = sessions.length;
  });

  loginWatcher = setInterval(async () => {
    const sessions = await getCurrentSessions();
    if (sessions.length > lastSessionCount) {
      const newSession = sessions[sessions.length - 1];
      if (newSession) {
        callback({
          user: newSession.user,
          terminal: newSession.terminal,
          host: newSession.host,
          loginTime: newSession.loginTime,
          type: "login",
        });
      }
    }
    lastSessionCount = sessions.length;
  }, 10000);
}

export function stopWatchingLogins(): void {
  if (loginWatcher) {
    clearInterval(loginWatcher);
    loginWatcher = null;
  }
}

let screenUnlockWatcher: ReturnType<typeof import("child_process").spawn> | null = null;

export function watchScreenUnlock(callback: () => void): void {
  try {
    const { spawn } = require("child_process");
    
    if (isWindows) {
      let lastLockState = false;
      const checkInterval = setInterval(async () => {
        try {
          const { stdout } = await execAsync(
            `powershell -Command "(Get-Process -Name 'LogonUI' -ErrorAction SilentlyContinue) -ne $null"`
          );
          const isLocked = stdout.trim().toLowerCase() === "true";
          
          if (lastLockState && !isLocked) {
            console.log("[UNLOCK] Screen unlocked detected");
            callback();
          }
          lastLockState = isLocked;
        } catch {}
      }, 5000);
      
      (screenUnlockWatcher as any) = { kill: () => clearInterval(checkInterval) };
      console.log("[WATCH] Watching for screen unlock events (Windows)...");
    } else {
      screenUnlockWatcher = spawn("dbus-monitor", [
        "--session",
        "type='signal',interface='org.gnome.ScreenSaver'"
      ]);

      let buffer = "";
      screenUnlockWatcher?.stdout?.on("data", (data: Buffer) => {
        buffer += data.toString();
        if (buffer.includes("boolean false")) {
          console.log("[UNLOCK] Screen unlocked detected via dbus");
          callback();
          buffer = "";
        } else if (buffer.includes("boolean true")) {
          console.log("[LOCK] Screen locked detected via dbus");
          buffer = "";
        }
      });

      screenUnlockWatcher?.stderr?.on("data", (data: Buffer) => {
        console.error("dbus-monitor error:", data.toString());
      });

      screenUnlockWatcher?.on("error", (err: Error) => {
        console.error("Failed to start dbus-monitor:", err.message);
      });

      console.log("[WATCH] Watching for screen unlock events...");
    }
  } catch (error) {
    console.error("Failed to watch screen unlock:", error);
  }
}

export function stopWatchingScreenUnlock(): void {
  if (screenUnlockWatcher) {
    screenUnlockWatcher.kill();
    screenUnlockWatcher = null;
  }
}
