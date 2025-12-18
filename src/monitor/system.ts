import si from "systeminformation";

export interface SystemStats {
  timestamp: Date;
  cpu: {
    usage: number;
    temperature: number | null;
    cores: number;
    model: string;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
    mounts: Array<{
      mount: string;
      size: number;
      used: number;
      usagePercent: number;
    }>;
  };
  network: {
    interfaces: Array<{
      name: string;
      ip4: string;
      ip6: string;
      mac: string;
    }>;
    connections: Array<{
      protocol: string;
      localAddress: string;
      localPort: number;
      peerAddress: string;
      peerPort: number;
      state: string;
      process: string;
    }>;
  };
  processes: {
    total: number;
    running: number;
    topCpu: Array<{
      name: string;
      pid: number;
      cpu: number;
      memory: number;
    }>;
    topMemory: Array<{
      name: string;
      pid: number;
      cpu: number;
      memory: number;
    }>;
  };
  uptime: number;
  hostname: string;
  platform: string;
  osInfo: string;
}

function formatBytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024 * 1024) * 100) / 100;
}

export async function getSystemStats(): Promise<SystemStats> {
  const [
    cpuLoad,
    cpuTemp,
    cpuInfo,
    mem,
    disk,
    networkInterfaces,
    networkConnections,
    processes,
    osInfo,
    time,
  ] = await Promise.all([
    si.currentLoad(),
    si.cpuTemperature(),
    si.cpu(),
    si.mem(),
    si.fsSize(),
    si.networkInterfaces(),
    si.networkConnections(),
    si.processes(),
    si.osInfo(),
    si.time(),
  ]);

  const totalDisk = disk.reduce((acc, d) => acc + d.size, 0);
  const usedDisk = disk.reduce((acc, d) => acc + d.used, 0);

  const procList = processes.list || [];
  const sortedByCpu = [...procList].sort((a, b) => b.cpu - a.cpu).slice(0, 5);
  const sortedByMem = [...procList].sort((a, b) => b.mem - a.mem).slice(0, 5);

  const netInterfaces = Array.isArray(networkInterfaces) ? networkInterfaces : [];
  const netConnections = Array.isArray(networkConnections) ? networkConnections : [];

  return {
    timestamp: new Date(),
    cpu: {
      usage: Math.round(cpuLoad.currentLoad * 100) / 100,
      temperature: cpuTemp.main || null,
      cores: cpuInfo.cores,
      model: `${cpuInfo.manufacturer} ${cpuInfo.brand}`,
    },
    memory: {
      total: formatBytes(mem.total),
      used: formatBytes(mem.used),
      free: formatBytes(mem.free),
      usagePercent: Math.round((mem.used / mem.total) * 100 * 100) / 100,
    },
    disk: {
      total: formatBytes(totalDisk),
      used: formatBytes(usedDisk),
      free: formatBytes(totalDisk - usedDisk),
      usagePercent: Math.round((usedDisk / totalDisk) * 100 * 100) / 100,
      mounts: disk.map((d) => ({
        mount: d.mount,
        size: formatBytes(d.size),
        used: formatBytes(d.used),
        usagePercent: Math.round(d.use * 100) / 100,
      })),
    },
    network: {
      interfaces: netInterfaces
        .filter((i: si.Systeminformation.NetworkInterfacesData) => !i.internal)
        .map((i: si.Systeminformation.NetworkInterfacesData) => ({
          name: i.iface,
          ip4: i.ip4,
          ip6: i.ip6,
          mac: i.mac,
        })),
      connections: netConnections
        .filter((c: si.Systeminformation.NetworkConnectionsData) => c.state === "ESTABLISHED")
        .slice(0, 20)
        .map((c: any) => ({
          protocol: c.protocol,
          localAddress: c.localAddress,
          localPort: typeof c.localPort === "string" ? parseInt(c.localPort) : c.localPort,
          peerAddress: c.peerAddress,
          peerPort: typeof c.peerPort === "string" ? parseInt(c.peerPort) : c.peerPort,
          state: c.state,
          process: c.process || "unknown",
        })),
    },
    processes: {
      total: processes.all,
      running: processes.running,
      topCpu: sortedByCpu.map((p) => ({
        name: p.name,
        pid: p.pid,
        cpu: Math.round(p.cpu * 100) / 100,
        memory: Math.round(p.mem * 100) / 100,
      })),
      topMemory: sortedByMem.map((p) => ({
        name: p.name,
        pid: p.pid,
        cpu: Math.round(p.cpu * 100) / 100,
        memory: Math.round(p.mem * 100) / 100,
      })),
    },
    uptime: time.uptime,
    hostname: osInfo.hostname,
    platform: osInfo.platform,
    osInfo: `${osInfo.distro} ${osInfo.release}`,
  };
}

export async function getQuickStats(): Promise<{
  cpu: number;
  ram: number;
  disk: number;
}> {
  const [cpuLoad, mem, disk] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
  ]);

  const totalDisk = disk.reduce((acc, d) => acc + d.size, 0);
  const usedDisk = disk.reduce((acc, d) => acc + d.used, 0);

  return {
    cpu: Math.round(cpuLoad.currentLoad),
    ram: Math.round((mem.used / mem.total) * 100),
    disk: Math.round((usedDisk / totalDisk) * 100),
  };
}
