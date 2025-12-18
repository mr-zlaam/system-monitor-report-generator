#!/usr/bin/env bun
import { Command } from "commander";
import { createInterface } from "readline";
import {
  loadConfig,
  saveConfig,
  getDefaultConfig,
  type Config,
} from "./config/settings.ts";
import { getSystemStats, getQuickStats } from "./monitor/system.ts";
import {
  getCurrentSessions,
  getRecentLogins,
  getFailedLogins,
  watchLogins,
  stopWatchingLogins,
} from "./monitor/login.ts";
import {
  getActivitySummary,
  initializeBaseline,
  checkSuspiciousActivity,
} from "./monitor/activity.ts";
import {
  initWhatsApp,
  onWhatsAppMessage,
  destroyWhatsApp,
  getWhatsAppStatus,
} from "./auth/whatsapp.ts";
import { sendReportToWhatsApp, notifyViaWhatsApp } from "./notify/whatsapp.ts";
import { sendReportEmail, verifyEmailConfig } from "./notify/email.ts";
import {
  generateTextReport,
  generateQuickReport,
  generateAlertMessage,
  type FullReport,
} from "./report/generator.ts";

const program = new Command();

program
  .name("system-monitor")
  .description("Personal system monitoring tool with WhatsApp & Email notifications")
  .version("1.0.0");

program
  .command("setup")
  .description("Interactive setup wizard")
  .action(async () => {
    await runSetupWizard();
  });

program
  .command("start")
  .description("Start monitoring daemon")
  .option("-i, --interval <ms>", "Report interval in milliseconds", "3600000")
  .action(async (options) => {
    await startMonitoring(parseInt(options.interval));
  });

program
  .command("report")
  .description("Generate and send a report now")
  .option("-q, --quick", "Send quick status instead of full report")
  .option("--no-send", "Only display, don't send notifications")
  .action(async (options) => {
    const report = await generateReport();
    const text = options.quick
      ? generateQuickReport(
          report.system.cpu.usage,
          report.system.memory.usagePercent,
          report.system.disk.usagePercent,
          report.sessions.length,
          report.activity.suspiciousActivity
        )
      : generateTextReport(report);

    console.log(text);

    if (options.send !== false) {
      await sendNotifications(text);
    }
  });

program
  .command("status")
  .description("Show current system status")
  .action(async () => {
    const stats = await getQuickStats();
    const sessions = await getCurrentSessions();
    const suspicious = await checkSuspiciousActivity();

    console.log("\n🖥️  System Status\n");
    console.log(`CPU:      ${generateBar(stats.cpu)} ${stats.cpu}%`);
    console.log(`RAM:      ${generateBar(stats.ram)} ${stats.ram}%`);
    console.log(`Disk:     ${generateBar(stats.disk)} ${stats.disk}%`);
    console.log(`Sessions: ${sessions.length}`);

    if (suspicious.length > 0) {
      console.log("\n⚠️  Alerts:");
      suspicious.forEach((s) => console.log(`  • ${s}`));
    }
    console.log("");
  });

program
  .command("whatsapp")
  .description("WhatsApp authentication")
  .action(async () => {
    console.log("🔐 Initializing WhatsApp...\n");
    try {
      await initWhatsApp();
      const status = await getWhatsAppStatus();
      if (status.connected) {
        console.log(`\n✅ Connected as: ${status.phoneNumber}`);
      }
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  });

program
  .command("config")
  .description("View or update configuration")
  .option("--show", "Show current configuration")
  .option("--reset", "Reset to default configuration")
  .option("--phone <number>", "Set WhatsApp phone number")
  .option("--email-to <email>", "Set notification email address")
  .option("--email-user <email>", "Set SMTP username")
  .option("--email-pass <password>", "Set SMTP password")
  .option("--interval <minutes>", "Set report interval")
  .action(async (options) => {
    let config = loadConfig();

    if (options.reset) {
      config = getDefaultConfig();
      saveConfig(config);
      console.log("✅ Configuration reset to defaults");
      return;
    }

    if (options.phone) {
      config.whatsapp.phoneNumber = options.phone;
      config.whatsapp.enabled = true;
    }
    if (options.emailTo) {
      config.email.to = options.emailTo;
      config.email.enabled = true;
    }
    if (options.emailUser) {
      config.email.smtp.user = options.emailUser;
    }
    if (options.emailPass) {
      config.email.smtp.pass = options.emailPass;
    }
    if (options.interval) {
      config.monitoring.intervalMs = parseInt(options.interval);
    }

    if (
      options.phone ||
      options.emailTo ||
      options.emailUser ||
      options.emailPass ||
      options.interval
    ) {
      saveConfig(config);
      console.log("✅ Configuration updated");
    }

    if (options.show || Object.keys(options).length === 1) {
      console.log("\n📋 Current Configuration:\n");
      console.log("WhatsApp:");
      console.log(`  Enabled: ${config.whatsapp.enabled}`);
      console.log(`  Phone: ${config.whatsapp.phoneNumber || "(not set)"}`);
      console.log("\nEmail:");
      console.log(`  Enabled: ${config.email.enabled}`);
      console.log(`  To: ${config.email.to || "(not set)"}`);
      console.log(`  SMTP User: ${config.email.smtp.user || "(not set)"}`);
      console.log(`  SMTP Host: ${config.email.smtp.host}`);
      console.log("\nMonitoring:");
      console.log(`  Interval: ${config.monitoring.intervalMs} ms`);
      console.log(`  Report on login: ${config.monitoring.reportOnLogin}`);
      console.log(`  Report on suspicious: ${config.monitoring.reportOnSuspiciousActivity}`);
      console.log("\nAlerts Thresholds:");
      console.log(`  CPU: ${config.alerts.cpuThreshold}%`);
      console.log(`  RAM: ${config.alerts.ramThreshold}%`);
      console.log(`  Disk: ${config.alerts.diskThreshold}%`);
      console.log("");
    }
  });

program
  .command("test")
  .description("Test notifications")
  .option("-w, --whatsapp", "Test WhatsApp notification")
  .option("-e, --email", "Test email notification")
  .action(async (options) => {
    const testMessage = "🧪 Test notification from System Monitor\n\nIf you received this, notifications are working!";

    if (options.whatsapp) {
      console.log("Testing WhatsApp...");
      const sent = await notifyViaWhatsApp(testMessage);
      console.log(sent ? "✅ WhatsApp test sent!" : "❌ WhatsApp test failed");
    }

    if (options.email) {
      console.log("Testing Email...");
      const valid = await verifyEmailConfig();
      if (valid) {
        const sent = await sendReportEmail(testMessage);
        console.log(sent ? "✅ Email test sent!" : "❌ Email test failed");
      } else {
        console.log("❌ Email configuration invalid");
      }
    }

    if (!options.whatsapp && !options.email) {
      console.log("Specify --whatsapp or --email to test");
    }
  });

async function runSetupWizard(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  console.log("\n╔════════════════════════════════════════╗");
  console.log("║     System Monitor Setup Wizard        ║");
  console.log("╚════════════════════════════════════════╝\n");

  const config = getDefaultConfig();

  console.log("📱 WhatsApp Setup");
  console.log("─────────────────");
  const setupWhatsApp = await question("Enable WhatsApp notifications? (y/n): ");

  if (setupWhatsApp.toLowerCase() === "y") {
    config.whatsapp.enabled = true;
    const phone = await question("Enter your phone number (with country code, e.g., 923001234567): ");
    config.whatsapp.phoneNumber = phone.trim();

    console.log("\n🔐 Connecting to WhatsApp...");
    try {
      await initWhatsApp();
      console.log("✅ WhatsApp connected!\n");
    } catch (error) {
      console.log("⚠️ WhatsApp setup failed. You can try again later with: monitor whatsapp\n");
    }
  }

  console.log("\n📧 Email Setup");
  console.log("─────────────────");
  const setupEmail = await question("Enable email notifications? (y/n): ");

  if (setupEmail.toLowerCase() === "y") {
    config.email.enabled = true;
    config.email.to = await question("Email address to receive notifications: ");
    config.email.smtp.user = await question("SMTP username (your email): ");
    config.email.smtp.pass = await question("SMTP password (app password for Gmail): ");

    const customSmtp = await question("Use custom SMTP? (y/n, default is Gmail): ");
    if (customSmtp.toLowerCase() === "y") {
      config.email.smtp.host = await question("SMTP host: ");
      config.email.smtp.port = parseInt(await question("SMTP port: "));
      config.email.smtp.secure = (await question("Use SSL? (y/n): ")).toLowerCase() === "y";
    }
  }

  console.log("\n⏰ Monitoring Settings");
  console.log("─────────────────────────");
  const interval = await question(`Report interval in milliseconds (default ${config.monitoring.intervalMs}): `);
  if (interval) {
    config.monitoring.intervalMs = parseInt(interval);
  }

  saveConfig(config);

  console.log("\n✅ Setup complete!");
  console.log("\nTo start monitoring, run:");
  console.log("  bun run start");
  console.log("\nOr build a binary:");
  console.log("  bun run build");
  console.log("  ./dist/monitor start\n");

  rl.close();
}

async function generateReport(): Promise<FullReport> {
  const [system, sessions, recentLogins, failedLogins, activity] = await Promise.all([
    getSystemStats(),
    getCurrentSessions(),
    getRecentLogins(),
    getFailedLogins(),
    getActivitySummary(),
  ]);

  return {
    system,
    sessions,
    recentLogins,
    failedLogins,
    activity,
    generatedAt: new Date(),
  };
}

async function sendNotifications(message: string): Promise<void> {
  const config = loadConfig();

  if (config.whatsapp.enabled && config.whatsapp.phoneNumber) {
    console.log("📱 Sending to WhatsApp...");
    await sendReportToWhatsApp(message);
  }

  if (config.email.enabled && config.email.to) {
    console.log("📧 Sending email...");
    await sendReportEmail(message);
  }
}

async function startMonitoring(intervalMs: number): Promise<void> {
  const config = loadConfig();
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║      System Monitor Started            ║");
  console.log("╚════════════════════════════════════════╝\n");

  console.log(`📊 Report interval: ${intervalMs} ms`);
  console.log(`📱 WhatsApp: ${config.whatsapp.enabled ? "enabled" : "disabled"}`);
  console.log(`📧 Email: ${config.email.enabled ? "enabled" : "disabled"}`);
  console.log("\nPress Ctrl+C to stop\n");

  await initializeBaseline();

  if (config.whatsapp.enabled) {
    try {
      await initWhatsApp();

      onWhatsAppMessage(async (message, from) => {
        const cmd = message.toLowerCase().trim();

        if (cmd === "report" || cmd === "status") {
          const report = await generateReport();
          const text =
            cmd === "status"
              ? generateQuickReport(
                  report.system.cpu.usage,
                  report.system.memory.usagePercent,
                  report.system.disk.usagePercent,
                  report.sessions.length,
                  report.activity.suspiciousActivity
                )
              : generateTextReport(report);
          await sendReportToWhatsApp(text);
        } else if (cmd === "help") {
          await notifyViaWhatsApp(
            "📋 Commands:\n• report - Full system report\n• status - Quick status\n• help - Show this message"
          );
        }
      });
    } catch (error) {
      console.error("WhatsApp init failed:", error);
    }
  }

  if (config.monitoring.reportOnLogin) {
    watchLogins(async (event) => {
      const alert = generateAlertMessage(
        "login",
        `User: ${event.user}\nTerminal: ${event.terminal}\nFrom: ${event.host}\nTime: ${event.loginTime.toLocaleString()}`
      );
      await sendNotifications(alert);
    });
  }

  const checkAndReport = async () => {
    const report = await generateReport();

    if (config.monitoring.reportOnSuspiciousActivity && report.activity.suspiciousActivity.length > 0) {
      const alert = generateAlertMessage(
        "suspicious",
        report.activity.suspiciousActivity.join("\n")
      );
      await sendNotifications(alert);
    }

    const stats = report.system;
    const alerts: string[] = [];

    if (stats.cpu.usage > config.alerts.cpuThreshold) {
      alerts.push(`CPU usage: ${stats.cpu.usage}%`);
    }
    if (stats.memory.usagePercent > config.alerts.ramThreshold) {
      alerts.push(`RAM usage: ${stats.memory.usagePercent}%`);
    }
    if (stats.disk.usagePercent > config.alerts.diskThreshold) {
      alerts.push(`Disk usage: ${stats.disk.usagePercent}%`);
    }

    if (alerts.length > 0) {
      const alert = generateAlertMessage("threshold", alerts.join("\n"));
      await sendNotifications(alert);
    }
  };

  const sendScheduledReport = async () => {
    console.log(`[${new Date().toLocaleString()}] Sending scheduled report...`);
    const report = await generateReport();
    const text = generateTextReport(report);
    await sendNotifications(text);
  };

  await sendScheduledReport();

  setInterval(sendScheduledReport, intervalMs);

  setInterval(checkAndReport, 5 * 60 * 1000);

  process.on("SIGINT", async () => {
    console.log("\n\nShutting down...");
    stopWatchingLogins();
    await destroyWhatsApp();
    process.exit(0);
  });

  await new Promise(() => {});
}

function generateBar(percent: number): string {
  const width = 20;
  const filled = Math.round((percent / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

program.parse();
