import { exec } from "child_process";
import { promisify } from "util";
import si from "systeminformation";

const execAsync = promisify(exec);

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
  } catch {
    return [];
  }
}

export async function getActiveUsers(): Promise<string[]> {
  try {
    const { stdout } = await execAsync("users");
    return [...new Set(stdout.trim().split(/\s+/).filter(Boolean))];
  } catch {
    return [];
  }
}

export async function checkSuspiciousActivity(): Promise<string[]> {
  const suspicious: string[] = [];

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

  try {
    const processes = await si.processes();
    const procs = processes.list || [];
    const cryptoMiners = procs.filter(
      (p) =>
        p.name.toLowerCase().includes("miner") ||
        p.name.toLowerCase().includes("xmr") ||
        p.name.toLowerCase().includes("crypto") ||
        (p.cpu > 80 && p.name.match(/^[a-z0-9]{8,}$/i))
    );
    if (cryptoMiners.length > 0) {
      suspicious.push(
        `Potential crypto miner processes: ${cryptoMiners.map((p) => p.name).join(", ")}`
      );
    }
  } catch {}

  try {
    const { stdout: reverseShells } = await execAsync(
      "ss -tnp 2>/dev/null | grep -E 'ESTAB.*(bash|sh|nc|ncat|netcat)' || true"
    );
    if (reverseShells.trim()) {
      suspicious.push("Potential reverse shell connections detected");
    }
  } catch {}

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
