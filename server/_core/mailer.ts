/**
 * mailer.ts — Módulo de envio de e-mails via SMTP próprio
 *
 * Usa Nodemailer para enviar e-mails de:
 * - Convites para novos usuários
 * - Notificações de segurança
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import * as db from "../db";

// ─── Templates de E-mail ──────────────────────────────────────────────────────

function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Glutec System</title>
</head>
<body style="margin:0;padding:0;background:#F7F4EE;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EE;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
          <!-- Header dourado -->
          <tr>
            <td style="background:linear-gradient(135deg,#8A6526,#C9A55B,#F1D791,#B8863B,#8A6526);padding:32px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:700;letter-spacing:1px;">Glutec System</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Sistema de Gestão Médica</p>
            </td>
          </tr>
          <!-- Conteúdo -->
          <tr>
            <td style="padding:40px 48px;">
              ${content}
            </td>
          </tr>
          <!-- Rodapé -->
          <tr>
            <td style="padding:24px 48px;background:#F7F4EE;border-top:1px solid #E8E0D0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8B8B8B;">© 2026 Glutec System — Excelência em Gestão Médica</p>
              <p style="margin:4px 0 0;font-size:11px;color:#AAAAAA;">Este e-mail foi enviado automaticamente. Não responda.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function inviteEmailTemplate(params: {
  name: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresIn: string;
}): { subject: string; html: string } {
  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    medico: "Médico(a)",
    recepcionista: "Recepcionista",
    enfermeiro: "Enfermeiro(a)",
    user: "Usuário",
  };

  const roleLabel = roleLabels[params.role] || params.role;

  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;color:#050505;font-size:22px;">Você foi convidado!</h2>
    <p style="margin:0 0 24px;color:#555;font-size:15px;">
      <strong>${params.inviterName}</strong> convidou você para acessar o <strong>Glutec System</strong> como <strong>${roleLabel}</strong>.
    </p>

    <div style="background:#F7F4EE;border-radius:8px;padding:20px 24px;margin:0 0 28px;">
      <p style="margin:0;color:#6B6B6B;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Sua função</p>
      <p style="margin:4px 0 0;color:#050505;font-size:17px;font-weight:700;">${roleLabel}</p>
    </div>

    <p style="margin:0 0 20px;color:#555;font-size:14px;">
      Clique no botão abaixo para criar sua senha e ativar sua conta. O link expira em <strong>${params.expiresIn}</strong>.
    </p>

    <div style="text-align:center;margin:32px 0;">
      <a href="${params.acceptUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#8A6526,#C9A55B);color:#FFFFFF;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.5px;">
        Ativar minha conta
      </a>
    </div>

    <p style="margin:24px 0 0;color:#AAAAAA;font-size:12px;text-align:center;">
      Se você não esperava este convite, ignore este e-mail com segurança.
    </p>
  `);

  return {
    subject: `Convite para acessar o Glutec System`,
    html,
  };
}

// ─── Criar Transporter ────────────────────────────────────────────────────────

export function passwordResetEmailTemplate(params: {
  name?: string | null;
  resetUrl: string;
  expiresIn: string;
}): { subject: string; html: string } {
  const recipientName = params.name?.trim() || "Olá";

  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;color:#050505;font-size:22px;">Redefinição de senha</h2>
    <p style="margin:0 0 24px;color:#555;font-size:15px;">
      ${recipientName}, recebemos uma solicitação para redefinir a senha da sua conta no <strong>Glutec System</strong>.
    </p>

    <div style="background:#F7F4EE;border-radius:8px;padding:20px 24px;margin:0 0 28px;">
      <p style="margin:0;color:#6B6B6B;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Validade do link</p>
      <p style="margin:4px 0 0;color:#050505;font-size:17px;font-weight:700;">${params.expiresIn}</p>
    </div>

    <p style="margin:0 0 20px;color:#555;font-size:14px;">
      Use o botão abaixo para cadastrar uma nova senha. Por segurança, este link é temporário e só pode ser usado uma vez.
    </p>

    <div style="text-align:center;margin:32px 0;">
      <a href="${params.resetUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#8A6526,#C9A55B);color:#FFFFFF;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.5px;">
        Redefinir minha senha
      </a>
    </div>

    <p style="margin:24px 0 0;color:#777;font-size:12px;text-align:center;">
      Se você não pediu essa redefinição, ignore este e-mail. Sua senha atual continuará protegida.
    </p>
  `);

  return {
    subject: "Recuperação de senha do Glutec System",
    html,
  };
}

async function createTransporter(): Promise<Transporter | null> {
  const settings = await db.getSmtpSettings();
  if (!settings) return null;

  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure === 1,
    auth: {
      user: settings.user,
      pass: settings.password,
    },
    tls: {
      rejectUnauthorized: false, // Para SMTP auto-assinados
    },
  });
}

// ─── Enviar E-mail ────────────────────────────────────────────────────────────

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = await createTransporter();

    if (!transporter) {
      return { success: false, error: "Configurações de SMTP não encontradas." };
    }

    const settings = await db.getSmtpSettings();
    const from = settings?.fromName
      ? `"${settings.fromName}" <${settings.fromEmail || settings.user}>`
      : settings?.user ?? "noreply@glutec.com.br";

    await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    return { success: true };
  } catch (error: any) {
    console.error("[Mailer] Erro ao enviar e-mail:", error);
    return { success: false, error: error.message || "Erro desconhecido" };
  }
}

/** Testar conexão SMTP com configurações temporárias */
export async function testSmtpConnection(config: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      tls: { rejectUnauthorized: false },
    });

    await transporter.verify();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Falha na conexão SMTP" };
  }
}
