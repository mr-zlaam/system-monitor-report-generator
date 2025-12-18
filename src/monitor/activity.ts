import { exec } from "child_process";
import { promisify } from "util";
import { platform } from "os";
import si from "systeminformation";

const execAsync = promisify(exec);
const isWindows = platform() === "win32";

export interface USBDevice {
  name: string;
  vendor: string;
  id: string;
  type: string;
}

export interface ActivitySummary {
  activeUsers: string[];
  usbDevices: USBDevice[];
  newProcesses: string[];
  suspiciousActivity: string[];
  networkChanges: string[];
}

let knownProcesses: Set<string> = new Set();
let knownUSBDevices: Set<string> = new Set();

export async function getUSBDevices(): Promise<USBDevice[]> {
  try {
    if (isWindows) {
      const usbData = await si.usb();
      return usbData.map((device) => ({
        id: device.id?.toString() || "unknown",
        name: device.name || "Unknown Device",
        vendor: device.vendor || "unknown",
        type: device.type || "usb",
      }));
    } else {
      const { stdout } = await execAsync("lsusb 2>/dev/null || true");
      const lines = stdout.trim().split("\n").filter(Boolean);

      return lines.map((line) => {
        const match = line.match(
          /Bus\s+\d+\s+Device\s+\d+:\s+ID\s+([\w:]+)\s+(.+)/
        );
        return {
          id: match?.[1] || "unknown",
          name: match?.[2] || line,
          vendor: match?.[2]?.split(" ")[0] || "unknown",
          type: "usb",
        };
      });
    }
  } catch {
    return [];
  }
}

export async function getActiveUsers(): Promise<string[]> {
  try {
    if (isWindows) {
      const { stdout } = await execAsync(
        `powershell -Command "(Get-CimInstance -ClassName Win32_ComputerSystem).UserName"`
      );
      const user = stdout.trim();
      return user ? [user.split("\\").pop() || user] : [];
    } else {
      const { stdout } = await execAsync("users");
      return [...new Set(stdout.trim().split(/\s+/).filter(Boolean))];
    }
  } catch {
    return [];
  }
}

export async function checkSuspiciousActivity(): Promise<string[]> {
  const suspicious: string[] = [];

  if (isWindows) {
    try {
      const { stdout: rdpConns } = await execAsync(
        `powershell -Command "(Get-NetTCPConnection -LocalPort 3389 -State Established -ErrorAction SilentlyContinue).Count"`
      );
      const rdpCount = parseInt(rdpConns.trim()) || 0;
      if (rdpCount > 0) {
        suspicious.push(`${rdpCount} active RDP connections detected`);
      }
    } catch {}

    try {
      const { stdout: sshConns } = await execAsync(
        `powershell -Command "(Get-NetTCPConnection -LocalPort 22 -State Established -ErrorAction SilentlyContinue).Count"`
      );
      const sshCount = parseInt(sshConns.trim()) || 0;
      if (sshCount > 0) {
        suspicious.push(`${sshCount} active SSH connections detected`);
      }
    } catch {}
  } else {
    try {
      const { stdout: rootProcs } = await execAsync(
        "ps aux | grep -E '^root.*pts' | grep -v grep || true"
      );
      if (rootProcs.trim()) {
        suspicious.push("Root processes running on pseudo-terminals detected");
      }
    } catch {}

    try {
      const { stdout: sshConns } = await execAsync(
        "ss -tn state established '( dport = :22 or sport = :22 )' 2>/dev/null || true"
      );
      const sshLines = sshConns.trim().split("\n").filter(Boolean);
      if (sshLines.length > 1) {
        suspicious.push(`${sshLines.length - 1} active SSH connections detected`);
      }
    } catch {}
  }

  try {
    const processes = await si.processes();
    const procs = processes.list || [];
    const knownSafeProcesses = new Set([
      "chromium", "chrome", "firefox", "electron", "node", "bun", "npm",
      "code", "vscode", "cursor", "puppeteer", "playwright", "webpack",
      "typescript", "eslint", "prettier", "jest", "vitest", "cargo", "rustc",
      "python", "python3", "java", "javac", "docker", "containerd", "ffmpeg",
      "handbrake", "blender", "gimp", "kdenlive", "obs", "steam", "proton",
      "wine", "lutris", "discord", "slack", "teams", "zoom", "spotify",
    ]);
    const safeMiners = ["tracker-miner-fs", "tracker-miner-fs-3", "tracker-miner", "SearchIndexer"];
    const cryptoMiners = procs.filter(
      (p) => {
        const name = p.name.toLowerCase();
        if (safeMiners.some((safe) => name.includes(safe.toLowerCase()))) return false;
        return (
          (name.includes("miner") && !name.includes("tracker") && !name.includes("searchindexer")) ||
          name.includes("xmr") ||
          name.includes("monero") ||
          name.includes("ethminer") ||
          name.includes("cgminer") ||
          name.includes("bfgminer") ||
          name.includes("nicehash")
        );
      }
    );
    if (cryptoMiners.length > 0) {
      suspicious.push(
        `Potential crypto miner processes: ${cryptoMiners.map((p) => p.name).join(", ")}`
      );
    }
  } catch {}

  if (!isWindows) {
    try {
      const { stdout: reverseShells } = await execAsync(
        "ss -tnp 2>/dev/null | grep -E 'ESTAB.*(bash|sh|nc|ncat|netcat)' || true"
      );
      if (reverseShells.trim()) {
        suspicious.push("Potential reverse shell connections detected");
      }
    } catch {}
  } else {
    try {
      const { stdout: suspiciousProcs } = await execAsync(
        `powershell -Command "Get-Process | Where-Object { $_.ProcessName -match 'nc|ncat|netcat|powershell_ise' -and $_.MainWindowTitle -eq '' } | Select-Object -ExpandProperty ProcessName"`
      );
      if (suspiciousProcs.trim()) {
        suspicious.push(`Potentially suspicious hidden processes: ${suspiciousProcs.trim().split('\n').join(', ')}`);
      }
    } catch {}
  }

  return suspicious;
}

export async function initializeBaseline(): Promise<void> {
  try {
    const processes = await si.processes();
    const procs = processes.list || [];
    knownProcesses = new Set(procs.map((p) => p.name));

    const usb = await getUSBDevices();
    knownUSBDevices = new Set(usb.map((d) => d.id));
  } catch {}
}

export async function detectChanges(): Promise<{
  newProcesses: string[];
  newUSBDevices: USBDevice[];
}> {
  const changes = {
    newProcesses: [] as string[],
    newUSBDevices: [] as USBDevice[],
  };

  try {
    const processes = await si.processes();
    const procs = processes.list || [];
    const currentProcesses = new Set(procs.map((p) => p.name));

    for (const proc of currentProcesses) {
      if (!knownProcesses.has(proc)) {
        changes.newProcesses.push(proc);
      }
    }

    knownProcesses = currentProcesses;
  } catch {}

  try {
    const usb = await getUSBDevices();
    const currentUSB = new Set(usb.map((d) => d.id));

    for (const device of usb) {
      if (!knownUSBDevices.has(device.id)) {
        changes.newUSBDevices.push(device);
      }
    }

    knownUSBDevices = currentUSB;
  } catch {}

  return changes;
}

export async function getActivitySummary(): Promise<ActivitySummary> {
  const [activeUsers, usbDevices, changes, suspicious] = await Promise.all([
    getActiveUsers(),
    getUSBDevices(),
    detectChanges(),
    checkSuspiciousActivity(),
  ]);

  return {
    activeUsers,
    usbDevices,
    newProcesses: changes.newProcesses,
    suspiciousActivity: suspicious,
    networkChanges: [],
  };
}
