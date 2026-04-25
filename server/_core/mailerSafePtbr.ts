import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import * as db from "../db";

const JOB_TITLE_LABELS: Record<string, string> = {
  medico: "Médica(o)",
  gerente: "Gerente",
  massoterapeuta: "Massoterapeuta",
  tecnico_enfermagem: "Técnica(o) de enfermagem",
  enfermeiro: "Enfermeira(o)",
  secretaria: "Secretária(o)",
  apoio: "Apoio",
};

function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Glutec Cl&iacute;nica</title>
</head>
<body style="margin:0;padding:0;background:#F7F4EE;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EE;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#8A6526,#C9A55B,#F1D791,#B8863B,#8A6526);padding:32px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:700;letter-spacing:1px;">Glutec Cl&iacute;nica</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Sistema de gest&atilde;o m&eacute;dica</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 48px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 48px;background:#F7F4EE;border-top:1px solid #E8E0D0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8B8B8B;">&copy; 2026 Glutec Sistema - Excel&ecirc;ncia em gest&atilde;o m&eacute;dica</p>
              <p style="margin:4px 0 0;font-size:11px;color:#AAAAAA;">Este e-mail foi enviado automaticamente. N&atilde;o responda.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function mapRoleLabel(role: string) {
  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    medico: "Médica(o)",
    recepcionista: "Secretária(o) / apoio operacional",
    enfermeiro: "Enfermeira(o)",
    gerente: "Gerente",
    user: "Apoio",
  };

  return roleLabels[role] || role;
}

function mapJobTitles(jobTitles?: string[]) {
  if (!jobTitles || jobTitles.length === 0) return [];
  return jobTitles.map(jobTitle => JOB_TITLE_LABELS[jobTitle] || jobTitle);
}

export function inviteEmailTemplate(params: {
  name: string;
  inviterName: string;
  role: string;
  jobTitles?: string[];
  acceptUrl: string;
  expiresIn: string;
}): { subject: string; html: string } {
  const roleLabel = mapRoleLabel(params.role);
  const jobsLabel = mapJobTitles(params.jobTitles).join(", ") || roleLabel;

  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;color:#050505;font-size:22px;">Voc&ecirc; foi convidado!</h2>
    <p style="margin:0 0 24px;color:#555;font-size:15px;">
      <strong>${params.inviterName}</strong> convidou voc&ecirc; para acessar o sistema da <strong>Glutec Cl&iacute;nica</strong>.
    </p>

    <div style="background:#F7F4EE;border-radius:8px;padding:20px 24px;margin:0 0 28px;">
      <p style="margin:0;color:#6B6B6B;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Cargo(s) na equipe</p>
      <p style="margin:4px 0 0;color:#050505;font-size:17px;font-weight:700;">${jobsLabel}</p>
      <p style="margin:10px 0 0;color:#6B6B6B;font-size:13px;">Perfil t&eacute;cnico interno: <strong>${roleLabel}</strong></p>
    </div>

    <p style="margin:0 0 20px;color:#555;font-size:14px;">
      Clique no bot&atilde;o abaixo para criar sua senha e ativar sua conta. O link expira em <strong>${params.expiresIn}</strong>.
    </p>

    <div style="background:#FFF8E6;border:1px solid #E8D29B;border-radius:8px;padding:16px 18px;margin:0 0 28px;">
      <p style="margin:0 0 8px;color:#8A6526;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Como funciona o acesso</p>
      <p style="margin:0;color:#555;font-size:14px;line-height:1.7;">
        1. Voc&ecirc; cria sua senha.<br />
        2. Configura obrigatoriamente o Google Authenticator.<br />
        3. S&oacute; ent&atilde;o o acesso ao sistema fica liberado.<br />
        4. Se um dia esquecer a senha, use a op&ccedil;&atilde;o <strong>"Esqueci minha senha"</strong> na tela inicial.
      </p>
    </div>

    <div style="text-align:center;margin:32px 0;">
      <a href="${params.acceptUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#8A6526,#C9A55B);color:#FFFFFF;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.5px;">
        Ativar minha conta
      </a>
    </div>

    <p style="margin:24px 0 0;color:#777;font-size:12px;text-align:center;">
      Se voc&ecirc; n&atilde;o esperava este convite, ignore este e-mail com seguran&ccedil;a.
    </p>
  `);

  return {
    subject: "Convite para acessar o Glutec Clínica",
    html,
  };
}

export function passwordResetEmailTemplate(params: {
  name?: string | null;
  resetUrl: string;
  expiresIn: string;
}): { subject: string; html: string } {
  const recipientName = params.name?.trim() || "Olá";

  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;color:#050505;font-size:22px;">Redefini&ccedil;&atilde;o de senha</h2>
    <p style="margin:0 0 24px;color:#555;font-size:15px;">
      ${recipientName}, recebemos uma solicita&ccedil;&atilde;o para redefinir a senha da sua conta no <strong>Glutec</strong>.
    </p>

    <div style="background:#F7F4EE;border-radius:8px;padding:20px 24px;margin:0 0 28px;">
      <p style="margin:0;color:#6B6B6B;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Validade do link</p>
      <p style="margin:4px 0 0;color:#050505;font-size:17px;font-weight:700;">${params.expiresIn}</p>
    </div>

    <p style="margin:0 0 20px;color:#555;font-size:14px;">
      Use o bot&atilde;o abaixo para cadastrar uma nova senha. Por seguran&ccedil;a, este link &eacute; tempor&aacute;rio e s&oacute; pode ser usado uma vez.
    </p>

    <div style="text-align:center;margin:32px 0;">
      <a href="${params.resetUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#8A6526,#C9A55B);color:#FFFFFF;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.5px;">
        Redefinir minha senha
      </a>
    </div>

    <p style="margin:24px 0 0;color:#777;font-size:12px;text-align:center;">
      Se voc&ecirc; n&atilde;o pediu essa redefini&ccedil;&atilde;o, ignore este e-mail. Sua senha atual continuar&aacute; protegida.
    </p>
  `);

  return {
    subject: "Recuperação de senha do Glutec",
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
      rejectUnauthorized: false,
    },
  });
}

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
