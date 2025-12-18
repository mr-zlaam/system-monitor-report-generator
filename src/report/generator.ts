import type { SystemStats } from "../monitor/system.ts";
import type { LoginEvent, CurrentSession } from "../monitor/login.ts";
import type { ActivitySummary } from "../monitor/activity.ts";
import type {
  BrowserHistory,
  RunningProgram,
} from "../monitor/browser.ts";
import type { OpenWindow } from "../monitor/windows.ts";

export interface FullReport {
  system: SystemStats;
  sessions: CurrentSession[];
  recentLogins: LoginEvent[];
  failedLogins: LoginEvent[];
  activity: ActivitySummary;
  browserHistory?: BrowserHistory;
  runningPrograms?: RunningProgram[];
  openWindows?: OpenWindow[];
  generatedAt: Date;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(" ") || "< 1m";
}

export function generateTextReport(report: FullReport): string {
  const { system, sessions, failedLogins, activity } = report;
  const lines: string[] = [];

  lines.push("SYSTEM MONITOR REPORT");
  lines.push(`Date: ${report.generatedAt.toLocaleString()}`);
  lines.push(`Host: ${system.hostname} (${system.osInfo})`);
  lines.push(`Uptime: ${formatUptime(system.uptime)}`);
  lines.push("");

  lines.push("SYSTEM STATS");
  lines.push(`CPU Usage: ${system.cpu.usage.toFixed(1)}%`);
  if (system.cpu.temperature) {
    lines.push(`CPU Temp: ${system.cpu.temperature}°C`);
  }
  lines.push(`RAM Usage: ${system.memory.usagePercent.toFixed(1)}% (${system.memory.used}GB / ${system.memory.total}GB)`);
  lines.push(`Disk Usage: ${system.disk.usagePercent.toFixed(1)}% (${system.disk.used}GB / ${system.disk.total}GB)`);
  lines.push("");

  lines.push("ACTIVE SESSIONS");
  if (sessions.length === 0) {
    lines.push("No active sessions");
  } else {
    for (const session of sessions) {
      lines.push(`- ${session.user} @ ${session.terminal} (From: ${session.host}, Idle: ${session.idle})`);
    }
  }
  lines.push("");

  if (failedLogins.length > 0) {
    lines.push("FAILED LOGIN ATTEMPTS");
    lines.push(`${failedLogins.length} failed attempts in last 24h`);
    for (const login of failedLogins.slice(0, 5)) {
      lines.push(`- User: ${login.user} from ${login.host}`);
    }
    lines.push("");
  }

  if (activity.suspiciousActivity.length > 0) {
    lines.push("SUSPICIOUS ACTIVITY");
    for (const item of activity.suspiciousActivity) {
      lines.push(`! ${item}`);
    }
    lines.push("");
  }

  lines.push("TOP PROCESSES (CPU)");
  for (const proc of system.processes.topCpu) {
    lines.push(`- ${proc.name} (PID: ${proc.pid}): CPU ${proc.cpu}%, RAM ${proc.memory}%`);
  }
  lines.push("");

  lines.push("NETWORK CONNECTIONS");
  lines.push(`Active connections: ${system.network.connections.length}`);
  for (const conn of system.network.connections.slice(0, 5)) {
    lines.push(`- ${conn.peerAddress}:${conn.peerPort} (${conn.process})`);
  }
  lines.push("");

  if (activity.usbDevices.length > 0) {
    lines.push("USB DEVICES");
    for (const device of activity.usbDevices) {
      lines.push(`- ${device.name}`);
    }
    lines.push("");
  }

  if (report.openWindows && report.openWindows.length > 0) {
    lines.push("OPEN WINDOWS");
    for (const win of report.openWindows) {
      lines.push(`- ${win.title}`);
    }
    lines.push("");
  }

  if (report.runningPrograms && report.runningPrograms.length > 0) {
    lines.push("RUNNING PROGRAMS");
    for (const prog of report.runningPrograms.slice(0, 15)) {
      lines.push(`- ${prog.name} (PID: ${prog.pid}): CPU ${prog.cpu}%, RAM ${prog.mem}%, User ${prog.user}`);
    }
    lines.push("");
  }

  if (report.browserHistory) {
    const { thorium, chrome, edge } = report.browserHistory;

    if (thorium.length > 0) {
      lines.push("THORIUM HISTORY");
      for (const entry of thorium.slice(0, 10)) {
        lines.push(`- ${entry.title.substring(0, 50)} (${entry.visitTime})`);
        lines.push(`  ${entry.url.substring(0, 60)}`);
      }
      lines.push("");
    }

    if (chrome.length > 0) {
      lines.push("CHROME HISTORY");
      for (const entry of chrome.slice(0, 10)) {
        lines.push(`- ${entry.title.substring(0, 50)} (${entry.visitTime})`);
        lines.push(`  ${entry.url.substring(0, 60)}`);
      }
      lines.push("");
    }

    if (edge.length > 0) {
      lines.push("EDGE HISTORY");
      for (const entry of edge.slice(0, 10)) {
        lines.push(`- ${entry.title.substring(0, 50)} (${entry.visitTime})`);
        lines.push(`  ${entry.url.substring(0, 60)}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function generateQuickReport(
  cpu: number,
  ram: number,
  disk: number,
  sessions: number,
  suspicious: string[]
): string {
  const lines: string[] = [];

  lines.push("QUICK SYSTEM STATUS");
  lines.push(`CPU: ${cpu}%`);
  lines.push(`RAM: ${ram}%`);
  lines.push(`Disk: ${disk}%`);
  lines.push(`Sessions: ${sessions}`);

  if (suspicious.length > 0) {
    lines.push("");
    lines.push("ALERTS");
    for (const alert of suspicious) {
      lines.push(`- ${alert}`);
    }
  }

  lines.push("");
  lines.push(`Generated: ${new Date().toLocaleString()}`);

  return lines.join("\n");
}

export function generateAlertMessage(
  type: "login" | "suspicious" | "threshold",
  details: string
): string {
  const titles = {
    login: "NEW LOGIN DETECTED",
    suspicious: "SUSPICIOUS ACTIVITY ALERT",
    threshold: "RESOURCE THRESHOLD WARNING",
  };

  return `${titles[type]}\n\n${details}\n\nGenerated: ${new Date().toLocaleString()}`;
}

function generateProgressBar(percent: number, width: number): string {
  return "";
}
