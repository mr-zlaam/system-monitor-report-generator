import {
  sendWhatsAppMessage,
  isWhatsAppReady,
  initWhatsApp,
} from "../auth/whatsapp.ts";
import { loadConfig } from "../config/settings.ts";

export async function notifyViaWhatsApp(message: string): Promise<boolean> {
  const config = loadConfig();

  if (!config.whatsapp.enabled || !config.whatsapp.phoneNumber) {
    console.log("WhatsApp notifications are disabled or phone number not set");
    return false;
  }

  if (!isWhatsAppReady()) {
    try {
      await initWhatsApp();
    } catch (error) {
      console.error("Failed to initialize WhatsApp:", error);
      return false;
    }
  }

  return await sendWhatsAppMessage(config.whatsapp.phoneNumber, message);
}

export async function sendReportToWhatsApp(report: string): Promise<boolean> {
  const MAX_MESSAGE_LENGTH = 4000;

  if (report.length <= MAX_MESSAGE_LENGTH) {
    return await notifyViaWhatsApp(report);
  }

  const parts = splitMessage(report, MAX_MESSAGE_LENGTH);
  let allSent = true;

  for (let i = 0; i < parts.length; i++) {
    const header = `Report (${i + 1}/${parts.length})\n\n`;
    const sent = await notifyViaWhatsApp(header + parts[i]);
    if (!sent) allSent = false;
    await sleep(1000);
  }

  return allSent;
}

function splitMessage(message: string, maxLength: number): string[] {
  const parts: string[] = [];
  const lines = message.split("\n");
  let currentPart = "";

  for (const line of lines) {
    if ((currentPart + "\n" + line).length > maxLength) {
      if (currentPart) parts.push(currentPart);
      currentPart = line;
    } else {
      currentPart = currentPart ? currentPart + "\n" + line : line;
    }
  }

  if (currentPart) parts.push(currentPart);
  return parts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
