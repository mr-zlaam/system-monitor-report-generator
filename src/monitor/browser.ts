import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, copyFileSync, unlinkSync } from "fs";
import { homedir, tmpdir, platform } from "os";
import path from "path";

const execAsync = promisify(exec);
const isWindows = platform() === "win32";

export interface BrowserHistoryEntry {
  url: string;
  title: string;
  visitTime: string;
  browser: string;
}

export interface RunningProgram {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  user: string;
  command: string;
  startTime: string;
}

export interface BrowserHistory {
  thorium: BrowserHistoryEntry[];
  chrome: BrowserHistoryEntry[];
  edge: BrowserHistoryEntry[];
}

function getBrowserPaths(): Record<string, string> {
  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local");
    return {
      thorium: path.join(localAppData, "Thorium", "User Data", "Default", "History"),
      chrome: path.join(localAppData, "Google", "Chrome", "User Data", "Default", "History"),
      edge: path.join(localAppData, "Microsoft", "Edge", "User Data", "Default", "History"),
    };
  } else {
    return {
      thorium: path.join(homedir(), ".config/thorium/Default/History"),
      chrome: path.join(homedir(), ".config/google-chrome/Default/History"),
      edge: path.join(homedir(), ".config/microsoft-edge/Default/History"),
    };
  }
}

async function getBrowserHistory(
  browser: string,
  historyPath: string,
  limit: number = 20
): Promise<BrowserHistoryEntry[]> {
  if (!existsSync(historyPath)) {
    return [];
  }

  const tempPath = path.join(tmpdir(), `${browser}_history_${Date.now()}.db`);

  try {
    copyFileSync(historyPath, tempPath);

    const query = `SELECT url, title, datetime(last_visit_time/1000000-11644473600, 'unixepoch', 'localtime') as visit_time FROM urls ORDER BY last_visit_time DESC LIMIT ${limit};`;

    let stdout: string;
    if (isWindows) {
      const result = await execAsync(
        `powershell -Command "& { $db = '${tempPath.replace(/'/g, "''")}'; sqlite3 $db \\"${query}\\" }"`
      );
      stdout = result.stdout;
      
      if (!stdout.trim()) {
        const result2 = await execAsync(`sqlite3 "${tempPath}" "${query}"`);
        stdout = result2.stdout;
      }
    } else {
      const result = await execAsync(`sqlite3 "${tempPath}" "${query}" 2>/dev/null`);
      stdout = result.stdout;
    }

    const entries: BrowserHistoryEntry[] = [];
    const lines = stdout.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      const parts = line.split("|");
      if (parts.length >= 3) {
        entries.push({
          url: parts[0] ?? "",
          title: parts[1] ?? "No Title",
          visitTime: parts[2] ?? "",
          browser,
        });
      }
    }

    return entries;
  } catch {
    return [];
  } finally {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {}
  }
}

export async function getAllBrowserHistory(
  limit: number = 20
): Promise<BrowserHistory> {
  const browserPaths = getBrowserPaths();
  const thoriumPath = browserPaths.thorium ?? "";
  const chromePath = browserPaths.chrome ?? "";
  const edgePath = browserPaths.edge ?? "";

  const [thorium, chrome, edge] = await Promise.all([
    getBrowserHistory("thorium", thoriumPath, limit),
    getBrowserHistory("chrome", chromePath, limit),
    getBrowserHistory("edge", edgePath, limit),
  ]);

  return { thorium, chrome, edge };
}

export async function getRecentHistory(
  limit: number = 30
): Promise<BrowserHistoryEntry[]> {
  const history = await getAllBrowserHistory(limit);
  const all = [...history.thorium, ...history.chrome, ...history.edge];

  return all.sort(
    (a, b) => new Date(b.visitTime).getTime() - new Date(a.visitTime).getTime()
  );
}

export async function getRunningPrograms(): Promise<RunningProgram[]> {
  try {
    if (isWindows) {
      const { stdout } = await execAsync(
        `powershell -Command "Get-Process | Sort-Object -Property CPU -Descending | Select-Object -First 50 | ForEach-Object { [PSCustomObject]@{ PID = $_.Id; Name = $_.ProcessName; CPU = [math]::Round($_.CPU, 2); Mem = [math]::Round($_.WorkingSet64 / 1MB, 2); User = ''; StartTime = $_.StartTime } } | ConvertTo-Json"`
      );

      if (!stdout.trim()) return [];

      const procs = JSON.parse(stdout);
      const procArray = Array.isArray(procs) ? procs : [procs];

      return procArray.map((p: any) => ({
        pid: p.PID || 0,
        name: p.Name || "",
        cpu: p.CPU || 0,
        mem: p.Mem || 0,
        user: p.User || "",
        command: p.Name || "",
        startTime: p.StartTime || "",
      }));
    } else {
      const { stdout } = await execAsync(
        `ps aux --sort=-%cpu | head -51 | tail -50`
      );

      const lines = stdout.trim().split("\n").filter(Boolean);
      const programs: RunningProgram[] = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 11) {
          const user = parts[0] ?? "";
          const pid = parseInt(parts[1] ?? "0", 10);
          const cpu = parseFloat(parts[2] ?? "0");
          const mem = parseFloat(parts[3] ?? "0");
          const startTime = parts[8] ?? "";
          const command = parts.slice(10).join(" ");
          const cmdPart = parts[10] ?? "";
          const name = path.basename(cmdPart.split(" ")[0] ?? "");

          if (user !== "USER") {
            programs.push({
              pid,
              name,
              cpu,
              mem,
              user,
              command: command.substring(0, 100),
              startTime,
            });
          }
        }
      }

      return programs;
    }
  } catch {
    return [];
  }
}

export async function getGUIPrograms(): Promise<RunningProgram[]> {
  try {
    if (isWindows) {
      const { stdout } = await execAsync(
        `powershell -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 20 | ForEach-Object { [PSCustomObject]@{ PID = $_.Id; Name = $_.ProcessName; CPU = [math]::Round($_.CPU, 2); Mem = [math]::Round($_.WorkingSet64 / 1MB, 2); Title = $_.MainWindowTitle; StartTime = $_.StartTime } } | ConvertTo-Json"`
      );

      if (!stdout.trim()) return [];

      const procs = JSON.parse(stdout);
      const procArray = Array.isArray(procs) ? procs : [procs];

      return procArray.map((p: any) => ({
        pid: p.PID || 0,
        name: p.Name || "",
        cpu: p.CPU || 0,
        mem: p.Mem || 0,
        user: "",
        command: p.Title || p.Name || "",
        startTime: p.StartTime || "",
      }));
    } else {
      const { stdout } = await execAsync(
        `wmctrl -lp 2>/dev/null | awk '{print $3}' | xargs -I {} ps -p {} -o pid,comm,user,%cpu,%mem,lstart --no-headers 2>/dev/null || true`
      );

      if (!stdout.trim()) {
        const { stdout: fallback } = await execAsync(
          `ps aux | grep -E "chromium|chrome|thorium|firefox|code|cursor|electron|slack|discord|spotify|telegram|steam" | grep -v grep | head -20`
        );

        const lines = fallback.trim().split("\n").filter(Boolean);
        const programs: RunningProgram[] = [];

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 11) {
            const cmdPart = parts[10] ?? "";
            programs.push({
              pid: parseInt(parts[1] ?? "0", 10),
              name: path.basename(cmdPart),
              cpu: parseFloat(parts[2] ?? "0"),
              mem: parseFloat(parts[3] ?? "0"),
              user: parts[0] ?? "",
              command: parts.slice(10).join(" ").substring(0, 80),
              startTime: parts[8] ?? "",
            });
          }
        }

        const seen = new Set<string>();
        return programs.filter((p) => {
          if (seen.has(p.name)) return false;
          seen.add(p.name);
          return true;
        });
      }

      const lines = stdout.trim().split("\n").filter(Boolean);
      const programs: RunningProgram[] = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          programs.push({
            pid: parseInt(parts[0] ?? "0", 10),
            name: parts[1] ?? "",
            user: parts[2] ?? "",
            cpu: parseFloat(parts[3] ?? "0"),
            mem: parseFloat(parts[4] ?? "0"),
            command: parts[1] ?? "",
            startTime: parts.slice(5).join(" "),
          });
        }
      }

      return programs;
    }
  } catch {
    return [];
  }
}
