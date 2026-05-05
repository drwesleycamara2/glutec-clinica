import { authenticator } from "otplib";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const APP_NAME = "Glutec System";

authenticator.options = {
  window: 1,
  step: 30,
  digits: 6,
};

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export async function generateQrCodeDataUrl(
  email: string,
  secret: string
): Promise<string> {
  const otpAuthUrl = authenticator.keyuri(email, APP_NAME, secret);
  return QRCode.toDataURL(otpAuthUrl, {
    width: 256,
    margin: 2,
    color: {
      dark: "#050505",
      light: "#FFFFFF",
    },
  });
}

export function verifyTotpCode(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: token.replace(/\s/g, ""), secret });
  } catch {
    return false;
  }
}

// In-memory cache para impedir replay do mesmo código TOTP dentro da janela
// de 60–90s. Map<userId, lastUsedTokenNormalized>.
// Persiste apenas durante o processo: aceita-se que após restart o código
// volte a ser válido (vida útil natural do TOTP é 30s).
const RECENT_TOTP = new Map<number, { token: string; ts: number }>();
const TOTP_REPLAY_WINDOW_MS = 90 * 1000;

/**
 * Verifica o código TOTP e o "consome" para o usuário, impedindo que o mesmo
 * dígito-de-6 seja reaproveitado (replay) durante a janela de validação.
 */
export function verifyAndConsumeTotpCode(
  userId: number,
  token: string,
  secret: string,
): boolean {
  const normalized = String(token).replace(/\s/g, "");
  if (!normalized) return false;

  const recent = RECENT_TOTP.get(userId);
  const now = Date.now();
  if (recent && now - recent.ts < TOTP_REPLAY_WINDOW_MS && recent.token === normalized) {
    return false; // replay detectado
  }

  if (!verifyTotpCode(normalized, secret)) return false;

  RECENT_TOTP.set(userId, { token: normalized, ts: now });

  // Limpeza preguiçosa: remove entradas expiradas a cada chamada.
  if (RECENT_TOTP.size > 256) {
    for (const [id, entry] of RECENT_TOTP) {
      if (now - entry.ts > TOTP_REPLAY_WINDOW_MS) RECENT_TOTP.delete(id);
    }
  }

  return true;
}

export function generateBackupCodes(): string[] {
  return Array.from({ length: 8 }, () => {
    const bytes = randomBytes(4).toString("hex").toUpperCase();
    return `${bytes.slice(0, 4)}-${bytes.slice(4, 8)}`;
  });
}

export async function hashBackupCodes(codes: string[]): Promise<string> {
  const hashed = await Promise.all(codes.map(code => bcrypt.hash(code.replace("-", ""), 10)));
  return JSON.stringify(hashed);
}

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

  hashedCodes.splice(matchIndex, 1);
  return { valid: true, remainingCodesJson: JSON.stringify(hashedCodes) };
}
