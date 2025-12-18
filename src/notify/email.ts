import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { loadConfig } from "../config/settings.ts";

let transporter: Transporter | null = null;

export function initEmailTransporter(): Transporter | null {
  const config = loadConfig();

  if (!config.email.enabled || !config.email.smtp.user || !config.email.smtp.pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.secure,
    auth: {
      user: config.email.smtp.user,
      pass: config.email.smtp.pass,
    },
  });

  return transporter;
}

export async function sendEmail(
  subject: string,
  body: string,
  isHtml: boolean = false
): Promise<boolean> {
  const config = loadConfig();

  if (!config.email.enabled) {
    console.log("Email notifications are disabled");
    return false;
  }

  if (!transporter) {
    transporter = initEmailTransporter();
    if (!transporter) {
      console.error("Failed to initialize email transporter");
      return false;
    }
  }

  try {
    await transporter.sendMail({
      from: config.email.smtp.user,
      to: config.email.to,
      subject: subject,
      [isHtml ? "html" : "text"]: body,
    });
    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

export async function notifyViaEmail(
  subject: string,
  message: string
): Promise<boolean> {
  return await sendEmail(`System Monitor: ${subject}`, message);
}

export async function sendReportEmail(report: string): Promise<boolean> {
  const hostname = process.env.HOSTNAME || "Unknown";
  const subject = `System Report - ${hostname} - ${new Date().toLocaleString()}`;
  return await sendEmail(subject, report);
}

export async function verifyEmailConfig(): Promise<boolean> {
  const config = loadConfig();

  if (!config.email.enabled || !config.email.smtp.user) {
    return false;
  }

  if (!transporter) {
    transporter = initEmailTransporter();
    if (!transporter) return false;
  }

  try {
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}
