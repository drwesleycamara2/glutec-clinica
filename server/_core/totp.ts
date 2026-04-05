/**
 * totp.ts — Módulo TOTP para 2FA com App Autenticador
 *
 * Compatível com Google Authenticator, Authy, Microsoft Authenticator, etc.
 * Usa o padrão RFC 6238 (TOTP).
 */

import { TOTP, generateSecret as _gs } from "otplib";
const _totp = new TOTP();
import QRCode from "qrcode";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";

const APP_NAME = "Glutec Clínica";

// Configurar otplib para máxima compatibilidade
_totp.options = {
  window: 1,      // Aceitar código do período anterior/próximo (30s de tolerância)
  step: 30,       // Período de 30 segundos (padrão)
  digits: 6,      // 6 dígitos (padrão)
};

// ─── Gerar Secret e QR Code ───────────────────────────────────────────────────

export function generateTotpSecret(): string {
  return _gs(); // 20 bytes = 160 bits (seguro)
}

export async function generateQrCodeDataUrl(
  email: string,
  secret: string
): Promise<string> {
  const otpAuthUrl = _totp.keyuri(email, APP_NAME, secret);
  return QRCode.toDataURL(otpAuthUrl, {
    width: 256,
    margin: 2,
    color: {
      dark: "#050505",
      light: "#FFFFFF",
    },
  });
}

// ─── Verificar Código ─────────────────────────────────────────────────────────

export function verifyTotpCode(token: string, secret: string): boolean {
  try {
    return _totp.verify({ token: token.replace(/\s/g, ""), secret });
  } catch {
    return false;
  }
}

// ─── Códigos de Backup ────────────────────────────────────────────────────────

/** Gerar 8 códigos de backup (formato XXXX-XXXX) */
export function generateBackupCodes(): string[] {
  return Array.from({ length: 8 }, () => {
    const bytes = randomBytes(4).toString("hex").toUpperCase();
    return `${bytes.slice(0, 4)}-${bytes.slice(4, 8)}`;
  });
}

/** Hashear lista de códigos de backup para salvar no banco */
export async function hashBackupCodes(codes: string[]): Promise<string> {
  const hashed = await Promise.all(codes.map(code => bcrypt.hash(code.replace("-", ""), 10)));
  return JSON.stringify(hashed);
}

/** Verificar e consumir um código de backup */
export async function verifyAndConsumeBackupCode(
  inputCode: string,
  hashedCodesJson: string
): Promise<{ valid: boolean; remainingCodesJson: string }> {
  const hashedCodes: string[] = JSON.parse(hashedCodesJson);
  const normalizedInput = inputCode.replace(/[-\s]/g, "").toUpperCase();

  let matchIndex = -1;
  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(normalizedInput, hashedCodes[i]);
    if (match) {
      matchIndex = i;
      break;
    }
  }

  if (matchIndex === -1) {
    return { valid: false, remainingCodesJson: hashedCodesJson };
  }

  // Remove o código usado
  hashedCodes.splice(matchIndex, 1);
  return { valid: true, remainingCodesJson: JSON.stringify(hashedCodes) };
}
