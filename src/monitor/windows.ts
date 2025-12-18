import { exec } from "child_process";
import { promisify } from "util";
import { platform } from "os";

const execAsync = promisify(exec);
const isWindows = platform() === "win32";

export interface OpenWindow {
  title: string;
}

export async function getOpenWindows(): Promise<OpenWindow[]> {
  try {
    if (isWindows) {
      const { stdout } = await execAsync(
        `powershell -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -ExpandProperty MainWindowTitle | ConvertTo-Json"`
      );
      
      if (!stdout.trim()) return [];
      
      const titles = JSON.parse(stdout);
      const titleArray = Array.isArray(titles) ? titles : [titles];
      
      const ignoredPatterns = [
        /^Program Manager$/i,
        /^Windows Input Experience$/i,
        /^Settings$/i,
        /^\s*$/,
      ];
      
      const seenTitles = new Set<string>();
      const windows: OpenWindow[] = [];
      
      for (const title of titleArray) {
        if (!title || seenTitles.has(title)) continue;
        if (ignoredPatterns.some(p => p.test(title))) continue;
        
        seenTitles.add(title);
        windows.push({ title });
      }
      
      return windows.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      const { $ } = await import("bun");
      const display = process.env.DISPLAY || ":0";
      const result = await $`DISPLAY=${display} xdotool search --onlyvisible --name ".*" 2>/dev/null || true`.text();
      const windowIds = result.trim().split('\n').filter(Boolean);
      
      const windows: OpenWindow[] = [];
      const seenTitles = new Set<string>();
      
      const ignoredPatterns = [
        /^mutter guard window$/,
        /^gnome-shell$/,
        /^@!/,
        /^\s*$/,
      ];
      
      for (const wid of windowIds) {
        try {
          const title = (await $`DISPLAY=${display} xdotool getwindowname ${wid} 2>/dev/null || true`.text()).trim();
          
          if (!title || seenTitles.has(title)) continue;
          if (ignoredPatterns.some(p => p.test(title))) continue;
          
          seenTitles.add(title);
          windows.push({ title });
        } catch {
          continue;
        }
      }
      
      return windows.sort((a, b) => a.title.localeCompare(b.title));
    }
  } catch {
    return [];
  }
}

export function formatOpenWindows(windows: OpenWindow[]): string {
  if (windows.length === 0) {
    return "No open windows detected";
  }
  
  return windows.map(w => `• ${w.title}`).join('\n');
}
