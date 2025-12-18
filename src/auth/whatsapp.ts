import { Client, LocalAuth, type Message } from "whatsapp-web.js";
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
      console.log("\nScan this QR code with WhatsApp:\n");
      qrcode.generate(qr, { small: true });
      console.log("\nWaiting for QR scan...\n");
    });

      client.on("ready", async () => {
        console.log("[OK] WhatsApp client is ready!");
        isReady = true;

      const config = loadConfig();
      config.whatsapp.enabled = true;
      saveConfig(config);

      resolve(client!);
    });

    client.on("authenticated", () => {
      console.log("[OK] WhatsApp authenticated successfully!");
    });

    client.on("auth_failure", (msg) => {
      console.error("[ERROR] WhatsApp authentication failed:", msg);
      isReady = false;
      reject(new Error(`Auth failed: ${msg}`));
    });

    client.on("disconnected", (reason) => {
      console.log("[WARN] WhatsApp disconnected:", reason);
      isReady = false;
    });

      client.on("message", async (message: Message) => {
        if (onMessageCallback) {
          onMessageCallback(message.body, message.from);
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
      const config = loadConfig();
      const targetNumber = phoneNumber.replace(/[^0-9]/g, "");
      const myNumber = client.info.wid.user;

      let chatId: string;
      if (targetNumber === myNumber) {
        chatId = client.info.wid._serialized;
      } else {
        chatId = phoneNumber.includes("@c.us")
          ? phoneNumber
          : `${targetNumber}@c.us`;
      }

        await client.sendMessage(chatId, message);
        return true;
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
