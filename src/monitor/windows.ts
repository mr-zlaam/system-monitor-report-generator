import { $ } from "bun";

export interface OpenWindow {
  title: string;
}

export async function getOpenWindows(): Promise<OpenWindow[]> {
  try {
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
