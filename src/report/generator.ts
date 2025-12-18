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

  lines.push("═══════════════════════════════════════");
  lines.push("       SYSTEM MONITOR REPORT           ");
  lines.push("═══════════════════════════════════════");
  lines.push("");
  lines.push(`Date: ${report.generatedAt.toLocaleString()}`);
  lines.push(`Host: ${system.hostname} (${system.osInfo})`);
  lines.push(`Uptime: ${formatUptime(system.uptime)}`);
  lines.push("");

  lines.push("───────────────────────────────────────");
  lines.push("            SYSTEM STATS               ");
  lines.push("───────────────────────────────────────");
  lines.push("");

  const cpuBar = generateProgressBar(system.cpu.usage, 20);
  const ramBar = generateProgressBar(system.memory.usagePercent, 20);
  const diskBar = generateProgressBar(system.disk.usagePercent, 20);

  lines.push(`CPU:  ${cpuBar} ${system.cpu.usage.toFixed(1)}%`);
  if (system.cpu.temperature) {
    lines.push(`      Temp: ${system.cpu.temperature}°C`);
  }
  lines.push(`RAM:  ${ramBar} ${system.memory.usagePercent.toFixed(1)}%`);
  lines.push(`      ${system.memory.used}GB / ${system.memory.total}GB`);
  lines.push(`Disk: ${diskBar} ${system.disk.usagePercent.toFixed(1)}%`);
  lines.push(`   ${system.disk.used}GB / ${system.disk.total}GB`);
  lines.push("");

  lines.push("───────────────────────────────────────");
  lines.push("           ACTIVE SESSIONS             ");
  lines.push("───────────────────────────────────────");
  lines.push("");

  if (sessions.length === 0) {
    lines.push("No active sessions");
  } else {
    for (const session of sessions) {
      lines.push(`• ${session.user} @ ${session.terminal}`);
      lines.push(`  From: ${session.host} | Idle: ${session.idle}`);
    }
  }
  lines.push("");

  if (failedLogins.length > 0) {
    lines.push("───────────────────────────────────────");
    lines.push("        FAILED LOGIN ATTEMPTS          ");
    lines.push("───────────────────────────────────────");
    lines.push("");
    lines.push(`${failedLogins.length} failed attempts in last 24h`);
    for (const login of failedLogins.slice(0, 5)) {
      lines.push(`• User: ${login.user} from ${login.host}`);
    }
    lines.push("");
  }

  if (activity.suspiciousActivity.length > 0) {
    lines.push("───────────────────────────────────────");
    lines.push("         SUSPICIOUS ACTIVITY           ");
    lines.push("───────────────────────────────────────");
    lines.push("");
    for (const item of activity.suspiciousActivity) {
      lines.push(`[!] ${item}`);
    }
    lines.push("");
  }

  lines.push("───────────────────────────────────────");
  lines.push("          TOP PROCESSES (CPU)          ");
  lines.push("───────────────────────────────────────");
  lines.push("");
  for (const proc of system.processes.topCpu) {
    lines.push(`• ${proc.name} (PID: ${proc.pid})`);
    lines.push(`  CPU: ${proc.cpu}% | RAM: ${proc.memory}%`);
  }
  lines.push("");

  lines.push("───────────────────────────────────────");
  lines.push("        NETWORK CONNECTIONS            ");
  lines.push("───────────────────────────────────────");
  lines.push("");
  lines.push(`Active connections: ${system.network.connections.length}`);
  for (const conn of system.network.connections.slice(0, 5)) {
    lines.push(`• ${conn.peerAddress}:${conn.peerPort} (${conn.process})`);
  }
  lines.push("");

  if (activity.usbDevices.length > 0) {
    lines.push("───────────────────────────────────────");
    lines.push("           USB DEVICES                 ");
    lines.push("───────────────────────────────────────");
    lines.push("");
    for (const device of activity.usbDevices) {
      lines.push(`• ${device.name}`);
    }
    lines.push("");
  }

  if (report.openWindows && report.openWindows.length > 0) {
    lines.push("───────────────────────────────────────");
    lines.push("        OPEN WINDOWS                   ");
    lines.push("───────────────────────────────────────");
    lines.push("");
    for (const win of report.openWindows) {
      lines.push(`• ${win.title}`);
    }
    lines.push("");
  }

  if (report.runningPrograms && report.runningPrograms.length > 0) {
    lines.push("───────────────────────────────────────");
    lines.push("        RUNNING PROGRAMS               ");
    lines.push("───────────────────────────────────────");
    lines.push("");
    for (const prog of report.runningPrograms.slice(0, 15)) {
      lines.push(`• ${prog.name} (PID: ${prog.pid})`);
      lines.push(`  CPU: ${prog.cpu}% | RAM: ${prog.mem}% | User: ${prog.user}`);
    }
    lines.push("");
  }

  if (report.browserHistory) {
    const { thorium, chrome, edge } = report.browserHistory;

    if (thorium.length > 0) {
      lines.push("───────────────────────────────────────");
      lines.push("        THORIUM HISTORY                ");
      lines.push("───────────────────────────────────────");
      lines.push("");
      for (const entry of thorium.slice(0, 10)) {
        lines.push(`• ${entry.title.substring(0, 50)}`);
        lines.push(`  ${entry.url.substring(0, 60)}`);
        lines.push(`  Time: ${entry.visitTime}`);
      }
      lines.push("");
    }

    if (chrome.length > 0) {
      lines.push("───────────────────────────────────────");
      lines.push("        CHROME HISTORY                 ");
      lines.push("───────────────────────────────────────");
      lines.push("");
      for (const entry of chrome.slice(0, 10)) {
        lines.push(`• ${entry.title.substring(0, 50)}`);
        lines.push(`  ${entry.url.substring(0, 60)}`);
        lines.push(`  Time: ${entry.visitTime}`);
      }
      lines.push("");
    }

    if (edge.length > 0) {
      lines.push("───────────────────────────────────────");
      lines.push("        EDGE HISTORY                   ");
      lines.push("───────────────────────────────────────");
      lines.push("");
      for (const entry of edge.slice(0, 10)) {
        lines.push(`• ${entry.title.substring(0, 50)}`);
        lines.push(`  ${entry.url.substring(0, 60)}`);
        lines.push(`  Time: ${entry.visitTime}`);
      }
      lines.push("");
    }
  }

  lines.push("═══════════════════════════════════════");
  lines.push("           END OF REPORT               ");
  lines.push("═══════════════════════════════════════");

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

  lines.push("*Quick System Status*");
  lines.push("");
  lines.push(`CPU: ${generateProgressBar(cpu, 10)} ${cpu}%`);
  lines.push(`RAM: ${generateProgressBar(ram, 10)} ${ram}%`);
  lines.push(`Disk: ${generateProgressBar(disk, 10)} ${disk}%`);
  lines.push(`Sessions: ${sessions}`);

  if (suspicious.length > 0) {
    lines.push("");
    lines.push("*Alerts:*");
    for (const alert of suspicious) {
      lines.push(`• ${alert}`);
    }
  }

  lines.push("");
  lines.push(`_${new Date().toLocaleString()}_`);

  return lines.join("\n");
}

export function generateAlertMessage(
  type: "login" | "suspicious" | "threshold",
  details: string
): string {
  const titles = {
    login: "[LOGIN] New Login Detected",
    suspicious: "[ALERT] Suspicious Activity",
    threshold: "[WARN] Resource Alert",
  };

  return `*${titles[type]}*\n\n${details}\n\n_${new Date().toLocaleString()}_`;
}

function generateProgressBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}
