import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface Config {
  whatsapp: {
    phoneNumber: string;
    enabled: boolean;
  };
  email: {
    enabled: boolean;
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
    };
    to: string;
  };
  monitoring: {
    intervalMs: number;
    reportOnLogin: boolean;
    reportOnSuspiciousActivity: boolean;
  };
  browserHistory: {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  };
  alerts: {
    cpuThreshold: number;
    ramThreshold: number;
    diskThreshold: number;
    failedLoginAttempts: number;
  };
}

const CONFIG_DIR = join(homedir(), ".config", "system-monitor");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const SESSION_DIR = join(CONFIG_DIR, "whatsapp-session");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getSessionDir(): string {
  return SESSION_DIR;
}

export function clearSessionDir(): void {
  if (existsSync(SESSION_DIR)) {
    rmSync(SESSION_DIR, { recursive: true, force: true });
  }
  mkdirSync(SESSION_DIR, { recursive: true });
}

export function getDefaultConfig(): Config {
  return {
    whatsapp: {
      phoneNumber: "",
      enabled: false,
    },
    email: {
      enabled: false,
      smtp: {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        user: "",
        pass: "",
      },
      to: "",
    },
    monitoring: {
      intervalMs: 3600000,
      reportOnLogin: true,
      reportOnSuspiciousActivity: true,
    },
    browserHistory: {
      startHour: 5,
      startMinute: 0,
      endHour: 19,
      endMinute: 30,
    },
    alerts: {
      cpuThreshold: 90,
      ramThreshold: 90,
      diskThreshold: 90,
      failedLoginAttempts: 3,
    },
  };
}

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }
}

export function loadConfig(): Config {
  ensureConfigDir();
  if (existsSync(CONFIG_FILE)) {
    try {
      const data = readFileSync(CONFIG_FILE, "utf-8");
      return { ...getDefaultConfig(), ...JSON.parse(data) };
    } catch {
      return getDefaultConfig();
    }
  }
  return getDefaultConfig();
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function updateConfig(updates: Partial<Config>): Config {
  const current = loadConfig();
  const updated = { ...current, ...updates };
  saveConfig(updated);
  return updated;
}
