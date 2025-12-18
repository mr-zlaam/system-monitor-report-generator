import { Client, LocalAuth, Message } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { getSessionDir, loadConfig, saveConfig } from "../config/settings.ts";

let client: Client | null = null;
let isReady = false;
let onMessageCallback: ((message: string, from: string) => void) | null = null;

export function isWhatsAppReady(): boolean {
  return isReady;
}

export function getWhatsAppClient(): Client | null {
  return client;
}

export async function initWhatsApp(): Promise<Client> {
  if (client && isReady) {
    return client;
  }

  return new Promise((resolve, reject) => {
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: getSessionDir(),
      }),
      webVersionCache: {
        type: "remote",
        remotePath:
          "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
      },
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      },
    });

    client.on("qr", (qr) => {
      console.log("\n📱 Scan this QR code with WhatsApp:\n");
      qrcode.generate(qr, { small: true });
      console.log("\nWaiting for QR scan...\n");
    });

    client.on("ready", () => {
      console.log("✅ WhatsApp client is ready!");
      isReady = true;

      const config = loadConfig();
      config.whatsapp.enabled = true;
      saveConfig(config);

      resolve(client!);
    });

    client.on("authenticated", () => {
      console.log("✅ WhatsApp authenticated successfully!");
    });

    client.on("auth_failure", (msg) => {
      console.error("❌ WhatsApp authentication failed:", msg);
      isReady = false;
      reject(new Error(`Auth failed: ${msg}`));
    });

    client.on("disconnected", (reason) => {
      console.log("⚠️ WhatsApp disconnected:", reason);
      isReady = false;
    });

    client.on("message", async (message: Message) => {
      if (onMessageCallback) {
        const contact = await message.getContact();
        onMessageCallback(message.body, contact.number);
      }
    });

    client.initialize().catch(reject);
  });
}

export function onWhatsAppMessage(
  callback: (message: string, from: string) => void
): void {
  onMessageCallback = callback;
}

export async function sendWhatsAppMessage(
  phoneNumber: string,
  message: string
): Promise<boolean> {
  if (!client || !isReady) {
    console.error("WhatsApp client is not ready");
    return false;
  }

  try {
    const chatId = phoneNumber.includes("@c.us")
      ? phoneNumber
      : `${phoneNumber.replace(/[^0-9]/g, "")}@c.us`;

    // Retry logic for "Evaluation failed" errors
    let lastError: any;
    for (let i = 0; i < 3; i++) {
      try {
        await client.sendMessage(chatId, message);
        return true;
      } catch (error: any) {
        lastError = error;
        if (error.message.includes("Evaluation failed") && i < 2) {
          console.log(`Retrying WhatsApp message send (${i + 1}/3)...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
        break;
      }
    }

    console.error("Failed to send WhatsApp message:", lastError);
    return false;
  } catch (error) {
    console.error("Failed to send WhatsApp message (outer):", error);
    return false;
  }
}

export async function destroyWhatsApp(): Promise<void> {
  if (client) {
    await client.destroy();
    client = null;
    isReady = false;
  }
}

export async function getWhatsAppStatus(): Promise<{
  connected: boolean;
  phoneNumber: string | null;
}> {
  if (!client || !isReady) {
    return { connected: false, phoneNumber: null };
  }

  try {
    const info = client.info;
    return {
      connected: true,
      phoneNumber: info?.wid?.user || null,
    };
  } catch {
    return { connected: false, phoneNumber: null };
  }
}
