import otplib from "otplib";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const { authenticator } = otplib as any;
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
